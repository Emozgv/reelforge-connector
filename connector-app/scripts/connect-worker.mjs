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

const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login/phone-or-email/email",
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

async function connectMain(platform, account, token) {
  if (!LOGIN_URL[platform]) {
    emit("error", { message: "ReelForge Connector was opened with an invalid connection link." });
    process.exit(1);
  }

  emit("opening", { platform });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL[platform], { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    await browser.close();
    emit("error", { message: `Couldn't open the ${platform} login page. Check your internet connection and try again.` });
    process.exit(1);
  }

  emit("waiting");

  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  let connected = false;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (!browser.isConnected()) {
      emit("error", { message: "The login window was closed before you finished logging in." });
      process.exit(1);
    }
    const cookies = await context.cookies();
    if (hasRealSession(platform, cookies)) {
      connected = true;
      break;
    }
    await sleep(700);
  }

  if (!connected) {
    if (browser.isConnected()) await browser.close();
    emit("error", { message: "This took too long. Go back to ReelForge and press Reconnect to try again." });
    process.exit(1);
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
  const context = await browser.newContext({ storageState });
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

async function main() {
  const { mode, platform, account, token } = parseArgs();
  if (!account || !token) {
    emit("error", { message: "ReelForge Connector was opened with an invalid connection link." });
    process.exit(1);
  }
  if (mode === "resync") {
    await resyncMain(account, token);
  } else {
    await connectMain(platform, account, token);
  }
}

main().catch((err) => {
  emit("error", { message: err?.message ?? "Something unexpected went wrong." });
  process.exit(1);
});
