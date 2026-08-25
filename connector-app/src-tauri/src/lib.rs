use serde::Deserialize;
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::Command,
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
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

// Runs the real login (a real, visible Chromium window the VA logs into
// themselves) and streams its progress back to the window as it happens —
// this can take anywhere from a few seconds to several minutes depending on
// whether Instagram/TikTok asks for extra verification.
#[tauri::command]
async fn start_connect(handle: AppHandle, platform: String, account: String, token: String) -> Result<(), String> {
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
            .arg(format!("--platform={platform}"))
            .arg(format!("--account={account}"))
            .arg(format!("--token={token}"))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

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
    });

    Ok(())
}

#[derive(Debug, Deserialize)]
struct ParsedConnectUrl {
    platform: String,
    account: String,
    token: String,
}

// The web app opens reelforge-connect://connect?platform=..&account=..&token=..
fn parse_connect_url(raw: &str) -> Option<ParsedConnectUrl> {
    let url = url::Url::parse(raw).ok()?;
    let mut platform = None;
    let mut account = None;
    let mut token = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "platform" => platform = Some(v.into_owned()),
            "account" => account = Some(v.into_owned()),
            "token" => token = Some(v.into_owned()),
            _ => {}
        }
    }
    Some(ParsedConnectUrl {
        platform: platform?,
        account: account?,
        token: token?,
    })
}

fn emit_connect_url(handle: &AppHandle, raw: &str) {
    if let Some(parsed) = parse_connect_url(raw) {
        let _ = handle.emit(
            "reelforge-connect-url",
            serde_json::json!({ "platform": parsed.platform, "account": parsed.account, "token": parsed.token }),
        );
    }
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("reelforge-connect://")) {
                emit_connect_url(app, url);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    emit_connect_url(&handle, url.as_str());
                }
            });

            // Cold start: the app was launched *by* the deep link itself.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    emit_connect_url(app.handle(), url.as_str());
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_connect])
        .run(tauri::generate_context!())
        .expect("error while running ReelForge Connector");
}
