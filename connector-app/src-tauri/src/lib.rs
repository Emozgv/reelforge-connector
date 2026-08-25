use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::Command,
    sync::Mutex,
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

// Resolves the Node runtime ReelForge Connector bundles with itself — VAs
// never need Node/npm/Playwright installed; this is the exact copy of the
// Node binary that built the app (see scripts/prepare-bundled-runtime.mjs),
// the same technique ReelForge Internal already ships in production.
fn resolve_node_executable(handle: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(bundled) = handle.path().resolve("runtime/node", BaseDirectory::Resource) {
        if bundled.exists() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&bundled) {
                    let mut perms = meta.permissions();
                    if perms.mode() & 0o111 == 0 {
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&bundled, perms);
                    }
                }
            }
            return Ok(bundled);
        }
    }

    // Development fallback only — a packaged app always hits the branch above.
    let explicit = ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"];
    for value in explicit {
        let p = PathBuf::from(value);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let p = dir.join("node");
            if p.exists() {
                return Ok(p);
            }
        }
    }
    Err("ReelForge Connector's bundled Node runtime was not found.".into())
}

// On Windows, Tauri's resource path resolution canonicalizes to an
// extended-length (\\?\-prefixed) path. Most Windows APIs are fine with
// that, but Node's own CommonJS entry-point resolution chokes on it and can
// crash before any script code runs — confirmed in ReelForge Internal on a
// real Windows build (same bundled-Node-plus-resource-script shape as this
// app). Strip the verbatim prefix before handing the script path to `node`.
fn strip_windows_verbatim_prefix(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let s = path.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

fn connect_worker_path(handle: &AppHandle) -> Result<PathBuf, String> {
    let candidates = [
        handle.path().resolve("connect-worker.mjs", BaseDirectory::Resource).ok(),
        std::env::current_dir().ok().map(|p| p.join("scripts").join("connect-worker.mjs")),
        std::env::current_dir().ok().map(|p| p.join("..").join("scripts").join("connect-worker.mjs")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Ok(strip_windows_verbatim_prefix(candidate));
        }
    }
    Err("ReelForge Connector's login worker script was not found.".into())
}

fn session_server_path(handle: &AppHandle) -> Result<PathBuf, String> {
    let candidates = [
        handle.path().resolve("session-server.mjs", BaseDirectory::Resource).ok(),
        std::env::current_dir().ok().map(|p| p.join("scripts").join("session-server.mjs")),
        std::env::current_dir().ok().map(|p| p.join("..").join("scripts").join("session-server.mjs")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Ok(strip_windows_verbatim_prefix(candidate));
        }
    }
    Err("ReelForge Connector's session server script was not found.".into())
}

// Spawned once, when Connector itself launches (see .setup()) — this is the
// long-running process the web app talks to directly over
// http://127.0.0.1:PORT for an active research session's next/prev/like.
// It's cheap to have running idle (no browser opens until a session is
// actually requested), so there's no lazy-start complexity here: it's just
// always there the moment Connector is.
fn spawn_session_server(handle: &AppHandle) {
    let (worker, node) = match (session_server_path(handle), resolve_node_executable(handle)) {
        (Ok(w), Ok(n)) => (w, n),
        (Err(e), _) | (_, Err(e)) => {
            eprintln!("Could not start ReelForge Connector's session server: {e}");
            return;
        }
    };

    let mut command = Command::new(&node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    // The session server must never outlive Connector — otherwise "quit
    // Connector" stops meaning "no live feed available" the moment this
    // child keeps running as an orphan after the parent process is gone
    // (spawn() here doesn't tie the child's lifetime to ours in any way on
    // its own). Passing our own pid lets the script poll for us instead:
    // robust against a clean quit, a force-quit, and a crash alike, since
    // it doesn't depend on us getting a chance to run any exit handler.
    command
        .arg(&worker)
        .env("PLAYWRIGHT_BROWSERS_PATH", "0")
        .env("REELFORGE_PARENT_PID", std::process::id().to_string());

    // Logged to a file (session start/end/timeout — see session-server.mjs)
    // rather than discarded, so a real session-lifecycle problem can
    // actually be diagnosed instead of guessed at.
    if let Ok(log_dir) = handle.path().app_log_dir() {
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("session-server.log");
        if let Ok(log_file) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            if let Ok(log_file_err) = log_file.try_clone() {
                command.stdout(log_file).stderr(log_file_err);
            }
        } else {
            command.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        }
    } else {
        command.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    }

    if let Err(e) = command.spawn() {
        eprintln!("Could not start ReelForge Connector's session server: {e}");
    }
}

// Runs the real login (a real, visible Chromium window the VA logs into
// themselves) and streams its progress back to the window as it happens —
// this can take anywhere from a few seconds to several minutes depending on
// whether Instagram/TikTok asks for extra verification.
#[tauri::command]
async fn start_connect(
    handle: AppHandle,
    mode: String,
    platform: String,
    account: String,
    token: String,
    target_url: Option<String>,
) -> Result<(), String> {
    let worker = connect_worker_path(&handle)?;
    let node = resolve_node_executable(&handle)?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(&node);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        command.env("PLAYWRIGHT_BROWSERS_PATH", "0");
        command
            .arg(&worker)
            .arg(format!("--mode={mode}"))
            .arg(format!("--platform={platform}"))
            .arg(format!("--account={account}"))
            .arg(format!("--token={token}"))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        if let Some(target_url) = &target_url {
            command.arg(format!("--targetUrl={target_url}"));
        }

        let mut child = match command.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = handle.emit(
                    "connect-progress",
                    serde_json::json!({ "event": "error", "message": format!("Could not start the ReelForge login helper: {e}") }),
                );
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().flatten() {
                let trimmed = line.trim();
                if trimmed.starts_with('{') {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let _ = handle.emit("connect-progress", value);
                    }
                }
            }
        }

        if let Ok(status) = child.wait() {
            if !status.success() {
                let _ = handle.emit(
                    "connect-progress",
                    serde_json::json!({ "event": "error", "message": "The login helper closed before finishing. You can try again." }),
                );
            }
        }

        // The window is only ever shown for a real login (see
        // handle_connect_url) — once that's actually finished, there's
        // nothing left for the VA to look at, so it shouldn't keep sitting
        // on screen as leftover clutter during the research session that
        // follows.
        if mode == "connect" {
            std::thread::sleep(std::time::Duration::from_secs(4));
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.hide();
            }
        }
    });

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParsedConnectUrl {
    mode: String,
    platform: String,
    account: String,
    token: String,
    #[serde(rename = "targetUrl", skip_serializing_if = "Option::is_none")]
    target_url: Option<String>,
}

// The web app opens one of:
//   reelforge-connect://connect?platform=..&account=..&token=..              (real login)
//   reelforge-connect://resync?account=..&token=..                          (resync — reuses the existing session)
//   reelforge-connect://like?account=..&token=..&targetUrl=..               (real Like on the real reel)
//   reelforge-connect://wake?account=wake&token=wake                        (just ensure Connector is running)
//
// A live research session itself (next/prev/like while actively swiping)
// doesn't go through this deep-link mechanism at all — see
// scripts/session-server.mjs, which the web app talks to directly over
// http://127.0.0.1 once Connector is confirmed running. "wake" exists only
// to get Connector's process alive (and therefore its session server
// listening) when it isn't already, the same way opening any other link
// would as a side effect — it deliberately does nothing else.
fn parse_connect_url(raw: &str) -> Option<ParsedConnectUrl> {
    let url = url::Url::parse(raw).ok()?;
    let mode = url.host_str().unwrap_or("connect").to_string();
    let mut platform = None;
    let mut account = None;
    let mut token = None;
    let mut target_url = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "platform" => platform = Some(v.into_owned()),
            "account" => account = Some(v.into_owned()),
            "token" => token = Some(v.into_owned()),
            "targetUrl" => target_url = Some(v.into_owned()),
            _ => {}
        }
    }
    Some(ParsedConnectUrl {
        mode,
        platform: platform.unwrap_or_default(),
        account: account?,
        token: token?,
        target_url,
    })
}

// On a cold start (the app launched *by* the deep link) the OS delivers the
// URL — and this fires — before the webview has finished loading main.js,
// so a plain fire-and-forget event gets emitted into the void with no
// listener attached yet and is lost forever. Confirmed as the real cause of
// a live test where Connector opened but never received the connection
// request: the window painted its default idle state because that's
// genuinely all it ever received. Storing the URL here and having the
// frontend *pull* it once on load (see take_pending_connect_url) makes this
// correct regardless of load timing. The live event stays too, for the
// already-running-app case where the frontend is definitely already loaded
// and listening by the time a second link arrives.
fn handle_connect_url(app: &AppHandle, raw: &str) {
    let Some(parsed) = parse_connect_url(raw) else { return };

    if let Some(state) = app.try_state::<Mutex<Option<ParsedConnectUrl>>>() {
        if let Ok(mut guard) = state.lock() {
            *guard = Some(parsed.clone());
        }
    }
    let _ = app.emit("reelforge-connect-url", &parsed);

    // A real login is the one case that genuinely needs the VA's attention
    // (a real browser window they have to interact with) — everything else
    // (resync, like) runs a real but headless browser and should never pull
    // focus or even become visible. Confirmed as a real product complaint:
    // Connector's window popping up during ordinary background prefetching
    // interrupted research sessions that had nothing for the VA to do.
    if parsed.mode == "connect" {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
fn take_pending_connect_url(state: State<Mutex<Option<ParsedConnectUrl>>>) -> Option<ParsedConnectUrl> {
    state.lock().ok().and_then(|mut guard| guard.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(None::<ParsedConnectUrl>))
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("reelforge-connect://")) {
                handle_connect_url(app, url);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            spawn_session_server(app.handle());

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_connect_url(&handle, url.as_str());
                }
            });

            // Cold start: the app was launched *by* the deep link itself.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_connect_url(app.handle(), url.as_str());
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_connect, take_pending_connect_url])
        .run(tauri::generate_context!())
        .expect("error while running ReelForge Connector");
}
