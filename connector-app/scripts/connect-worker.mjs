// Runs inside ReelForge Connector's bundled Node + Playwright runtime — the
// VA never sees this file or a terminal. It opens a real, visible Chromium
// window on the real platform's login page and waits for the VA to actually
// finish logging in (password, 2FA, SMS code, checkpoint, CAPTCHA — whatever
// the platform asks for; this script never sees or asks for a password
// itself). The moment a genuine session cookie appears, it captures the
// browser's full storage state and hands it to ReelForge, which is the only
// thing that ever flips a Research Account to "active" (see
// submit-research-account-session). Each stdout line is one JSON progress
// event that the Rust host relays straight to the ReelForge Connector window.
import { chromium } from "playwright";

const SUBMIT_URL = process.env.REELFORGE_SUBMIT_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-account-session";
const FETCH_SESSION_URL = process.env.REELFORGE_FETCH_SESSION_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/fetch-research-account-session";
const SUBMIT_SYNC_URL = process.env.REELFORGE_SUBMIT_SYNC_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-feed-sync";
const SUBMIT_ACTION_URL = process.env.REELFORGE_SUBMIT_ACTION_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-reel-action";
const CANCEL_CONNECT_URL = process.env.REELFORGE_CANCEL_CONNECT_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/cancel-research-account-connect";

const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  // The normal homepage, not the forced email/password route — the VA sees
  // TikTok's own real "Anmelden" flow (QR, phone/email, Facebook, Google,
  // LINE, whatever TikTok currently offers) instead of a route that skips
  // straight past all of that. Detection below never depended on being on
  // any particular URL — it just polls for a real session cookie — so this
  // is a safe, self-contained change.
  tiktok: "https://www.tiktok.com/",
};

// Automated (non-login) contexts force English — without this, Chromium
// inherits whatever locale the host machine is set to, Instagram renders
// its UI in that language, and any text/accessible-name-based selector
// (like the real Like button's "Like"/"Unlike" accessible name) silently
// never matches on a non-English machine. Confirmed as the real cause of
// "Like doesn't work": this account's own session was captured on a
// German-locale host, so Instagram was serving German UI the whole time.
// Login itself is untouched — the VA should see Instagram in whatever
// language they'd normally get.
const AUTOMATION_CONTEXT_OPTIONS = {
  locale: "en-US",
  extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
};

function emit(event, extra = {}) {
  console.log(JSON.stringify({ event, ...extra }));
}

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-z]+)=(.*)$/i);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function hasRealSession(platform, cookies) {
  if (platform === "instagram") {
    return cookies.some((c) => c.domain.includes("instagram.com") && c.name === "sessionid" && c.value);
  }
  if (platform === "tiktok") {
    return cookies.some(
      (c) => c.domain.includes("tiktok.com") && (c.name === "sessionid" || c.name === "sid_tt") && c.value
    );
  }
  return false;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

// Instagram's web client loads the real, personalized home feed via its own
// internal JSON API calls (not a public API) rather than fully server-
// rendered HTML — so instead of scraping the page, this listens to every
// JSON response the page itself makes while the feed loads, and picks out
// anything shaped like a real media item. That shape (a "code" shortcode
// plus image_versions2/video_versions candidates) has stayed the stable
// part of Instagram's internal media object across the many endpoint/field
// renames the surrounding response wrappers go through, so sniffing for it
// structurally is more durable here than hardcoding one endpoint URL.
function looksLikeMedia(node) {
  return (
    node &&
    typeof node === "object" &&
    typeof node.code === "string" &&
    (node.image_versions2?.candidates?.length || node.video_versions?.length)
  );
}

function parseMedia(node) {
  try {
    const videoVersions = node.video_versions;
    const videoUrl = Array.isArray(videoVersions) && videoVersions.length ? videoVersions[0].url : null;
    const thumbCandidates = node.image_versions2?.candidates;
    const thumbnailUrl = Array.isArray(thumbCandidates) && thumbCandidates.length ? thumbCandidates[0].url : null;
    if (!videoUrl && !thumbnailUrl) return null;

    const takenAt = typeof node.taken_at === "number" ? node.taken_at : null;
    const postedDaysAgo = takenAt ? Math.max(0, Math.floor((Date.now() / 1000 - takenAt) / 86400)) : null;

    return {
      id: node.code,
      sourceUrl: `https://www.instagram.com/reel/${node.code}/`,
      thumbnailUrl,
      videoUrl,
      caption: typeof node.caption?.text === "string" ? node.caption.text : null,
      username: node.user?.username ?? node.owner?.username ?? null,
      viewsRaw: typeof node.play_count === "number" ? node.play_count : (typeof node.view_count === "number" ? node.view_count : 0),
      likes: typeof node.like_count === "number" ? node.like_count : null,
      comments: typeof node.comment_count === "number" ? node.comment_count : null,
      durationSec: typeof node.video_duration === "number" ? Math.round(node.video_duration) : 0,
      postedDaysAgo,
    };
  } catch {
    return null;
  }
}

// GraphQL/timeline responses nest the actual media object several wrapper
// layers deep (data -> connection -> edges -> node -> media -> ...) — a
// shallow depth cap was the real reason the first live test only captured
// one item instead of a full batch, since most of the feed's real content
// simply never got walked into. There's no real content at very deep
// levels, so a generous cap here is free insurance, not a perf concern for
// a one-shot page-load-sized JSON body.
function collectMediaFrom(node, out, depth = 0) {
  if (depth > 24 || out.size >= 120 || !node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaFrom(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (looksLikeMedia(node)) {
    const parsed = parseMedia(node);
    if (parsed) out.set(parsed.id, parsed);
  }
  for (const key of Object.keys(node)) collectMediaFrom(node[key], out, depth + 1);
}

// Best-effort — a real login is what makes the account "connected"
// regardless of whether this captures anything, so every failure here is
// swallowed rather than allowed to fail the connection itself.
//
// Sourced ONLY from the Reels tab (instagram.com/reels/) — deliberately not
// the Home feed. Home is a chronological-ish mix of accounts you follow
// plus injected suggestions; Reels is Instagram's actual algorithmic
// recommendation surface, the direct equivalent of TikTok's For You and the
// specific thing "this account's trained/personalized feed" means. An
// earlier version of this also pulled from Home to pad out thin batches,
// but that meant the synced feed wasn't purely the account's real
// recommendation stream — removed rather than blended, even though it means
// a freshly-connected account with little Reels history may come back with
// fewer items at first.
async function captureInstagramFeed(context, page, { targetCount = 40, maxMs = 60000 } = {}) {
  const collected = new Map();
  const startedAt = Date.now();

  context.on("response", async (response) => {
    try {
      const url = response.url();
      if (!url.includes("instagram.com")) return;
      // Deliberately no content-type filter — some of Instagram's internal
      // endpoints don't declare a clean "application/json" header even
      // though the body is JSON; response.json() itself is the real check,
      // and it fails harmlessly (caught below) on anything that isn't.
      const body = await response.json().catch(() => null);
      if (body) collectMediaFrom(body, collected);
    } catch {
      // ignore
    }
  });

  async function scrollAndWait(rounds) {
    for (let i = 0; i < rounds; i++) {
      if (collected.size >= targetCount || Date.now() - startedAt > maxMs) return;
      await page.mouse.wheel(0, 1800).catch(() => {});
      await sleep(1400);
    }
  }

  try {
    await page.goto("https://www.instagram.com/reels/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2500);
    await scrollAndWait(24);
  } catch {
    // Nothing to fall back to — an empty/thin result here is honest: it
    // means this specific account's Reels recommendation stream didn't
    // load, not that some other, less relevant source filled in instead.
  }

  return Array.from(collected.values());
}

// Best-effort — tells ReelForge the connect attempt is dead so the account
// row doesn't sit at "connecting" forever with no way for Client OS (a
// separate browser tab that never sees this worker's stdout/Tauri events)
// to learn the attempt failed. Only ever flips a row that's still genuinely
// "connecting" under this exact token — see cancel-research-account-connect
// for why that makes this safe to fire even in a race with a login that
// actually just succeeded (submit-research-account-session already cleared
// the token by then, so this simply no-ops).
async function notifyCancelled(accountId, token) {
  try {
    await fetch(CANCEL_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, token }),
    });
  } catch {
    // Nothing more to do — Client OS's own "this is taking a while" copy
    // and the Reconnect action are still there as a manual fallback.
  }
}

async function connectMain(platform, account, token) {
  if (!LOGIN_URL[platform]) {
    emit("error", { message: "ReelForge Connector was opened with an invalid connection link." });
    process.exit(1);
  }

  emit("opening", { platform });

  // TikTok specifically uses the VA's own real, already-installed Chrome
  // (channel: "chrome") rather than Playwright's bundled Chromium — direct
  // testing showed the bundled build can't decode H.264/AAC at all (TikTok
  // videos silently fail) and gets flagged by TikTok's login defenses far
  // more readily. The close-to-cancel mechanism just below (page "close" +
  // an explicit browser.close() in cancelAndExit) was verified to work
  // identically against real Chrome — it doesn't depend on the browser
  // spontaneously reporting itself disconnected, so this doesn't touch that
  // guarantee at all. --renderer-process-limit=1 trims one of the several
  // extra OS processes a full Chrome install spawns versus the trimmed
  // Chromium build; real Chrome's baseline footprint (GPU process, network
  // service, crashpad handler, etc.) is otherwise fixed cost, not a bug —
  // running it alongside an already-open, heavily-tabbed everyday Chrome on
  // one machine is the likely source of any remaining sluggishness, not
  // something a launch flag can fix away. Instagram (and resync/like/wake)
  // are entirely untouched — this only ever applies for platform ===
  // "tiktok".
  const launchOptions = { headless: false };
  if (platform === "tiktok") {
    launchOptions.channel = "chrome";
    launchOptions.args = ["--renderer-process-limit=1"];
  }

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (err) {
    if (platform === "tiktok") {
      await notifyCancelled(account, token);
      emit("error", { message: "TikTok login needs Google Chrome installed on this computer. Install Chrome, then press Reconnect." });
      process.exit(1);
    }
    throw err;
  }
  const context = await browser.newContext();

  // The one thing that's still genuinely TikTok-specific: navigator.webdriver
  // reads true on Playwright's bundled Chromium, one of the simplest,
  // most commonly checked automation signals — this removes just that flag
  // without touching anything about how the browser process itself behaves,
  // so Instagram's window/process lifecycle is completely unaffected.
  if (platform === "tiktok") {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => undefined });
    });
  }

  const page = await context.newPage();

  // The VA closing the login window is a real, expected way for this to
  // end — not just "the browser process disconnected" (which, depending on
  // Chromium's own last-window-closed behavior, isn't guaranteed to happen
  // just because the one visible window did). Listening for the page's own
  // close event is what actually catches "the window was closed" reliably,
  // immediately, rather than depending on a slower/less certain signal.
  let cancelled = false;
  page.once("close", () => {
    cancelled = true;
  });
  browser.once("disconnected", () => {
    cancelled = true;
  });

  async function cancelAndExit(message) {
    await browser.close().catch(() => {});
    await notifyCancelled(account, token);
    emit("error", { message });
    process.exit(1);
  }

  try {
    await page.goto(LOGIN_URL[platform], { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    await cancelAndExit(`Couldn't open the ${platform} login page. Check your internet connection and try again.`);
  }

  emit("waiting");

  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  let connected = false;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (cancelled || !browser.isConnected()) {
      await cancelAndExit("The login window was closed before you finished logging in.");
    }
    const cookies = await context.cookies();
    if (hasRealSession(platform, cookies)) {
      connected = true;
      break;
    }
    await sleep(700);
  }

  if (!connected) {
    await cancelAndExit("This took too long. Go back to ReelForge and press Reconnect to try again.");
  }

  let feedItems = [];
  if (platform === "instagram") {
    emit("loading_feed");
    feedItems = await captureInstagramFeed(context, page);
  }

  const storageState = await context.storageState();
  await browser.close();

  emit("submitting");

  let res;
  try {
    res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account, token, platform, storageState, feedItems }),
    });
  } catch {
    emit("error", { message: "Logged in, but couldn't reach ReelForge to finish connecting. Check your internet connection and press Reconnect." });
    process.exit(1);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    emit("error", { message: body.error ?? "ReelForge couldn't finish connecting this account." });
    process.exit(1);
  }

  emit("connected", { feedItemsStored: body.feedItemsStored ?? 0 });
}

// Pulls in more real feed content for an account that's already genuinely
// connected — reuses its existing, already-verified session (fetched
// server-side, decrypted only for this one request) instead of asking for
// a fresh login. Runs headless since there's nothing for the VA to look at
// or interact with here; the account's own session already does the work.
async function resyncMain(accountId, token) {
  emit("opening", { platform: "instagram" });

  let sessionRes;
  try {
    sessionRes = await fetch(FETCH_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, token }),
    });
  } catch {
    emit("error", { message: "Couldn't reach ReelForge to start the sync. Check your internet connection and try again." });
    process.exit(1);
  }
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    emit("error", { message: sessionBody.error ?? "Couldn't load this account's session." });
    process.exit(1);
  }

  const { platform, storageState } = sessionBody;
  if (platform !== "instagram") {
    emit("error", { message: "Feed sync isn't available for this platform yet." });
    process.exit(1);
  }

  emit("loading_feed");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState, ...AUTOMATION_CONTEXT_OPTIONS });
  const page = await context.newPage();
  const feedItems = await captureInstagramFeed(context, page);
  await browser.close();

  emit("submitting");

  let res;
  try {
    res = await fetch(SUBMIT_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, token, feedItems }),
    });
  } catch {
    emit("error", { message: "Couldn't reach ReelForge to save the synced feed. Check your internet connection and try again." });
    process.exit(1);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    emit("error", { message: body.error ?? "ReelForge couldn't finish syncing this account's feed." });
    process.exit(1);
  }

  emit("connected", { feedItemsStored: body.feedItemsStored ?? 0 });
}

// Performs a REAL like on the account's REAL Instagram session — this is
// the actual product ask behind "don't fake engagement signals": clicking
// ReelForge's Like button drives a real, authenticated browser to the real
// reel URL and clicks Instagram's own Like control, the same way the human
// account owner would. Success is only ever reported if the click provably
// changed the real button's state (its aria-label flips from "Like" to
// "Unlike") — never assumed just because a click was dispatched.
async function likeMain(accountId, token, targetUrl) {
  emit("opening", { platform: "instagram" });

  let sessionRes;
  try {
    sessionRes = await fetch(FETCH_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, token }),
    });
  } catch {
    emit("error", { message: "Couldn't reach ReelForge to start this action. Check your internet connection and try again." });
    process.exit(1);
  }
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    emit("error", { message: sessionBody.error ?? "Couldn't load this account's session." });
    process.exit(1);
  }

  const { storageState } = sessionBody;
  emit("liking");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState, ...AUTOMATION_CONTEXT_OPTIONS });
  const page = await context.newPage();

  let liked = false;
  let failureReason = null;
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2500);

    // Instagram's web client labels the like control's accessible name
    // "Like" (unliked) / "Unlike" (already liked) — the one part of its
    // otherwise-obfuscated class names that's stayed stable and is
    // meaningful to target on purpose, since it's the same thing a screen
    // reader user relies on. AUTOMATION_CONTEXT_OPTIONS forces English so
    // that's actually true — without it this text simply doesn't exist on
    // a non-English-locale session. The attribute-selector fallback covers
    // the case where the label lives directly on the svg icon rather than
    // propagating up to something Playwright's role engine recognizes as a
    // button.
    async function isUnlikedVisible() {
      if (await page.getByRole("button", { name: "Like", exact: true }).first().isVisible().catch(() => false)) return true;
      return page.locator('svg[aria-label="Like" i]').first().isVisible().catch(() => false);
    }
    async function isLikedVisible() {
      if (await page.getByRole("button", { name: "Unlike", exact: true }).first().isVisible().catch(() => false)) return true;
      return page.locator('svg[aria-label="Unlike" i]').first().isVisible().catch(() => false);
    }
    async function clickLike() {
      const roleButton = page.getByRole("button", { name: "Like", exact: true }).first();
      if (await roleButton.isVisible().catch(() => false)) {
        await roleButton.click();
        return true;
      }
      const svgIcon = page.locator('svg[aria-label="Like" i]').first();
      if (await svgIcon.isVisible().catch(() => false)) {
        // The clickable element is typically an ancestor of the icon svg,
        // not the svg itself — walk up to the nearest element Playwright
        // considers actionable.
        await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
          await svgIcon.click();
        });
        return true;
      }
      return false;
    }

    const alreadyLiked = await isLikedVisible();

    if (alreadyLiked) {
      liked = true;
    } else if (await isUnlikedVisible()) {
      const clicked = await clickLike();
      if (!clicked) {
        failureReason = "Couldn't find a real Like button on this reel's page.";
      } else {
        await sleep(1500);
        liked = await isLikedVisible();
        if (!liked) failureReason = "Clicked Like, but Instagram's real button didn't confirm it.";
      }
    } else {
      failureReason = "Couldn't find a real Like button on this reel's page.";
    }
  } catch (err) {
    failureReason = err?.message ?? "Something went wrong while liking this reel.";
  }

  await browser.close();

  emit("submitting");

  let res;
  try {
    res = await fetch(SUBMIT_ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, token, ok: liked, error: failureReason ?? undefined }),
    });
  } catch {
    emit("error", { message: "The like may have gone through on Instagram, but ReelForge couldn't be notified. Check your internet connection." });
    process.exit(1);
  }
  await res.json().catch(() => ({}));

  if (!liked) {
    emit("error", { message: failureReason ?? "Couldn't verify the like on Instagram." });
    process.exit(1);
  }

  emit("connected", { liked: true });
}

async function main() {
  const { mode, platform, account, token, targetUrl } = parseArgs();
  if (!account || !token) {
    emit("error", { message: "ReelForge Connector was opened with an invalid connection link." });
    process.exit(1);
  }
  if (mode === "resync") {
    await resyncMain(account, token);
  } else if (mode === "like") {
    if (!targetUrl) {
      emit("error", { message: "ReelForge Connector was opened with an invalid like link." });
      process.exit(1);
    }
    await likeMain(account, token, decodeURIComponent(targetUrl));
  } else {
    await connectMain(platform, account, token);
  }
}

main().catch((err) => {
  emit("error", { message: err?.message ?? "Something unexpected went wrong." });
  process.exit(1);
});
