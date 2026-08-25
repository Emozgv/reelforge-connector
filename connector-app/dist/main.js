const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const icon = document.getElementById("icon");
const title = document.getElementById("title");
const subtitle = document.getElementById("subtitle");

const PLATFORM_NAME = { instagram: "Instagram", tiktok: "TikTok" };

function setState(kind, titleText, subtitleText) {
  icon.classList.remove("hidden", "check", "err", "spinner");
  if (kind === "spinner") icon.classList.add("spinner");
  if (kind === "check") {
    icon.classList.add("check");
    icon.textContent = "✓";
  }
  if (kind === "err") {
    icon.classList.add("err");
    icon.textContent = "!";
  }
  if (kind === "idle") icon.classList.add("hidden");
  title.textContent = titleText;
  subtitle.textContent = subtitleText;
}

let currentPlatform = null;
let currentMode = "connect";
let lastStartedKey = null;

function handleProgress(event) {
  const name = PLATFORM_NAME[currentPlatform] || "the account";
  switch (event.event) {
    case "opening":
      if (currentMode === "resync") {
        setState("spinner", "Reconnecting to its saved session…", "No login needed — reusing the account's existing session.");
      } else if (currentMode === "like") {
        setState("spinner", "Reconnecting to its saved session…", "No login needed — this reuses the account's existing session.");
      } else {
        setState("spinner", `Opening ${name} login…`, "A real login window is about to open. Log in as you normally would.");
      }
      break;
    case "waiting":
      setState("spinner", "Waiting for you to finish logging in…", "Complete any verification step the platform asks for — this closes itself once you're in.");
      break;
    case "loading_feed":
      setState(
        "spinner",
        currentMode === "resync" ? "Pulling in more of your real feed…" : "Loading your real feed…",
        "Reading this account's actual feed content."
      );
      break;
    case "liking":
      setState("spinner", "Liking on Instagram…", "Opening the real reel in this account's real session.");
      break;
    case "submitting":
      setState(
        "spinner",
        "Finishing up…",
        currentMode === "resync" ? "Saving the new reels to ReelForge." : currentMode === "like" ? "Confirming with ReelForge." : "Sending your session back to ReelForge."
      );
      break;
    case "connected": {
      if (currentMode === "like") {
        setState("check", "Liked!", "Confirmed on the real Instagram account. You can close this.");
        break;
      }
      const count = event.feedItemsStored || 0;
      const feedText = count > 0
        ? `${count} real reel${count === 1 ? "" : "s"} synced in — you can close this and go back to ReelForge.`
        : currentMode === "resync"
          ? "No new reels came in this time — its feed may not have changed yet. You can close this."
          : "You can close this window and go back to ReelForge — the account is now active.";
      setState("check", currentMode === "resync" ? "Synced!" : "Connected!", feedText);
      break;
    }
    case "error":
      setState(
        "err",
        currentMode === "like" ? "Couldn't confirm the like" : "Couldn't finish connecting",
        event.message || "Something went wrong. Go back to ReelForge and try again."
      );
      break;
  }
}

function startConnect(mode, platform, account, token, targetUrl) {
  // "wake" exists purely to get Connector's process (and therefore its
  // session server) running via a cold start — the app launching at all is
  // the entire point, there's no worker to spawn and nothing to show.
  if (mode === "wake") return;

  // Both the live event and the poll loop can observe the very same URL —
  // the poll consuming it right after a live event already handled it, or
  // vice versa — so skip only an exact repeat of the last one, never a
  // genuinely new connect/reconnect/sync/like request (different account or token).
  const key = `${mode}|${platform}|${account}|${token}`;
  if (key === lastStartedKey) return;
  lastStartedKey = key;
  currentMode = mode;
  currentPlatform = platform || "instagram";
  setState("spinner", "Getting ready…", "One moment.");
  void invoke("start_connect", { mode, platform: currentPlatform, account, token, targetUrl: targetUrl || null });
}

listen("connect-progress", (e) => handleProgress(e.payload));
listen("reelforge-connect-url", (e) => startConnect(e.payload.mode, e.payload.platform, e.payload.account, e.payload.token, e.payload.targetUrl));

// Cold start (the app was just launched BY the deep link): the OS delivers
// that URL asynchronously (a separate Apple Event on macOS, argv on
// Windows), which can arrive either before or after this script runs —
// there's no guaranteed ordering. Poll briefly rather than pulling once, so
// this is correct either way instead of depending on which side happens to
// win the race on a given machine.
async function pollPendingConnectUrl() {
  for (let i = 0; i < 15; i++) {
    const pending = await invoke("take_pending_connect_url");
    if (pending) {
      startConnect(pending.mode, pending.platform, pending.account, pending.token, pending.targetUrl);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}
void pollPendingConnectUrl();
