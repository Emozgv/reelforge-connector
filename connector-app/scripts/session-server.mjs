// ReelForge Connector's live research session server.
//
// This is the actual architecture change behind "the real authenticated
// session is the source of truth for the active Research session, not a
// database of previously-synced reels." A Research Account's swipe
// experience used to be reconstructed from client_os.research_feed_items —
// a queue built and periodically refilled from past syncs. That meant
// "next"/"previous" were really just moving a pointer through a locally
// re-filtered array, which could (and did) shift underneath the VA as the
// underlying data changed. Here, ReelForge's web app talks to this server
// directly (http://127.0.0.1:PORT, no deep link, no relaunch) and every
// "next" into genuinely new territory is a real scroll on a real, still-
// open Instagram Reels tab, with a real network response read back — not a
// guess reconstructed from storage. Going backward replays this session's
// own history in memory (also real: it's exactly what was already
// extracted from the live page), never a database re-query.
//
// One Node process, spawned once when Connector starts (see lib.rs) and
// kept running for the app's lifetime. Sessions are held in memory only —
// nothing here is persisted to Supabase. A session with no heartbeat for
// SESSION_TIMEOUT_MS is closed automatically, so a VA who just closes the
// tab (crash, force-quit, forgot) never leaves a real logged-in browser
// context running forever.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const PORT = Number(process.env.REELFORGE_SESSION_SERVER_PORT ?? 48211);
const FETCH_SESSION_URL = process.env.REELFORGE_FETCH_SESSION_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/fetch-research-account-session";

// The web app heartbeats every 15s while the tab is active — but browsers
// throttle setInterval in a *backgrounded* tab (Chrome can drop to roughly
// one firing per minute after a few minutes hidden), which is the normal,
// harmless case of a VA just switching tabs, not an abandoned session. A
// too-tight timeout here was reaping perfectly live sessions out from under
// a VA who'd only tabbed away — root cause of "the feed gets stuck after
// switching tabs." 5 minutes comfortably outlasts realistic background
// throttling while still closing a genuinely abandoned session (tab closed,
// beforeunload/pagehide didn't get a chance to fire) in reasonable time.
// The web app's own visibilitychange handler (see useLiveResearchSession)
// is the fast path back for anything beyond this — it re-checks and
// recovers the instant a tab becomes visible again, rather than waiting.
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
// Instagram/TikTok are otherwise identical from here down — this is the one
// map that actually varies per platform: where the live For-You/Reels
// surface lives, and which domain its own internal JSON responses come
// from (used below to scope response-sniffing per session).
const REEL_URL = { instagram: "https://www.instagram.com/reels/", tiktok: "https://www.tiktok.com/foryou" };
const PLATFORM_DOMAIN = { instagram: "instagram.com", tiktok: "tiktok.com" };

// Same reasoning as connect-worker.mjs: force English so the real Like
// button's accessible name ("Like"/"Unlike") is actually there to find,
// regardless of the host machine's own locale.
const AUTOMATION_CONTEXT_OPTIONS = {
  locale: "en-US",
  extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
};

function looksLikeInstagramMedia(node) {
  return (
    node &&
    typeof node === "object" &&
    typeof node.code === "string" &&
    (node.image_versions2?.candidates?.length || node.video_versions?.length)
  );
}

function parseInstagramMedia(node) {
  try {
    const videoVersions = node.video_versions;
    const videoUrl = Array.isArray(videoVersions) && videoVersions.length ? videoVersions[0].url : null;
    const thumbCandidates = node.image_versions2?.candidates;
    const thumbnailUrl = Array.isArray(thumbCandidates) && thumbCandidates.length ? thumbCandidates[0].url : null;
    if (!videoUrl && !thumbnailUrl) return null;

    const takenAt = typeof node.taken_at === "number" ? node.taken_at : null;
    const postedDaysAgo = takenAt ? Math.max(0, Math.floor((Date.now() / 1000 - takenAt) / 86400)) : null;

    return {
      id: `instagram:${node.code}`,
      sourceUrl: `https://www.instagram.com/reel/${node.code}/`,
      thumbnailUrl,
      videoUrl,
      caption: typeof node.caption?.text === "string" ? node.caption.text : null,
      username: node.user?.username ?? node.owner?.username ?? null,
      // Confirmed via live capture: Instagram's own Reels response regularly
      // sends view_count as an explicit null (not merely absent) rather than
      // a real number — this endpoint often just doesn't expose a view
      // count for a Reel at all. null here means exactly that: no real
      // count was available, never faked as 0.
      viewsRaw: typeof node.play_count === "number" ? node.play_count : (typeof node.view_count === "number" ? node.view_count : null),
      likes: typeof node.like_count === "number" ? node.like_count : null,
      comments: typeof node.comment_count === "number" ? node.comment_count : null,
      durationSec: typeof node.video_duration === "number" ? Math.round(node.video_duration) : 0,
      postedDaysAgo,
    };
  } catch {
    return null;
  }
}

// TikTok's web client loads its own For You feed the same way Instagram
// does — internal JSON API calls (api/recommend/item_list and friends)
// rather than server-rendered HTML — so this uses the exact same
// sniff-the-response-traffic approach as Instagram above, just matched
// against TikTok's own stable item shape: an `id` alongside a `video`
// object carrying `playAddr`, and an `author` object carrying `uniqueId`.
// That shape has stayed the durable part of TikTok's feed item across the
// wrapper/endpoint churn the same way Instagram's `code` + version
// candidates has.
function looksLikeTikTokMedia(node) {
  return (
    node &&
    typeof node === "object" &&
    typeof node.id === "string" &&
    node.video &&
    typeof node.video === "object" &&
    typeof node.video.playAddr === "string" &&
    node.author &&
    typeof node.author === "object" &&
    typeof node.author.uniqueId === "string"
  );
}

function parseTikTokMedia(node) {
  try {
    const video = node.video ?? {};
    const author = node.author ?? {};
    const stats = node.stats ?? {};
    const videoUrl = typeof video.playAddr === "string" ? video.playAddr : null;
    const thumbnailUrl = typeof video.cover === "string" ? video.cover : (typeof video.originCover === "string" ? video.originCover : null);
    if (!videoUrl && !thumbnailUrl) return null;

    const username = typeof author.uniqueId === "string" ? author.uniqueId : null;
    const createTime = typeof node.createTime === "number" ? node.createTime : null;
    const postedDaysAgo = createTime ? Math.max(0, Math.floor((Date.now() / 1000 - createTime) / 86400)) : null;

    return {
      id: `tiktok:${node.id}`,
      sourceUrl: username ? `https://www.tiktok.com/@${username}/video/${node.id}` : `https://www.tiktok.com/video/${node.id}`,
      thumbnailUrl,
      videoUrl,
      caption: typeof node.desc === "string" ? node.desc : null,
      username,
      // Same rule as Instagram's parser above: only a real number counts —
      // never fabricated as 0 when TikTok's own stats object doesn't carry it.
      viewsRaw: typeof stats.playCount === "number" ? stats.playCount : null,
      likes: typeof stats.diggCount === "number" ? stats.diggCount : null,
      comments: typeof stats.commentCount === "number" ? stats.commentCount : null,
      durationSec: typeof video.duration === "number" ? Math.round(video.duration) : 0,
      postedDaysAgo,
    };
  } catch {
    return null;
  }
}

const MEDIA_ADAPTER = {
  instagram: { looksLikeMedia: looksLikeInstagramMedia, parseMedia: parseInstagramMedia },
  tiktok: { looksLikeMedia: looksLikeTikTokMedia, parseMedia: parseTikTokMedia },
};

function collectMediaFrom(node, out, seenIds, adapter, depth = 0) {
  if (depth > 24 || !node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaFrom(item, out, seenIds, adapter, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (adapter.looksLikeMedia(node)) {
    const parsed = adapter.parseMedia(node);
    if (parsed && !seenIds.has(parsed.id)) out.push(parsed);
  }
  for (const key of Object.keys(node)) collectMediaFrom(node[key], out, seenIds, adapter, depth + 1);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

// Instagram's web client labels the like control's accessible name "Like"
// (unliked) / "Unlike" (already liked) — the one part of its otherwise-
// obfuscated class names that's stayed stable and is meaningful to target on
// purpose, since it's the same thing a screen reader user relies on.
// AUTOMATION_CONTEXT_OPTIONS forces English so that's actually true. The
// attribute-selector fallback covers the case where the label lives
// directly on the svg icon rather than propagating up to something
// Playwright's role engine recognizes as a button. Success is only ever
// reported once the click provably flipped the real button's state — never
// assumed just because a click was dispatched.
async function likeInstagram(page) {
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
      await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
        await svgIcon.click();
      });
      return true;
    }
    return false;
  }

  if (await isLikedVisible()) return { liked: true };
  if (!(await isUnlikedVisible())) return { liked: false, error: "Couldn't find a real Like button on this reel's page." };
  if (!(await clickLike())) return { liked: false, error: "Couldn't find a real Like button on this reel's page." };
  await sleep(1500);
  const liked = await isLikedVisible();
  return liked ? { liked: true } : { liked: false, error: "Clicked Like, but Instagram's real button didn't confirm it." };
}

// TikTok's web client doesn't swap a clean "Like"/"Unlike" accessible name
// the way Instagram does — the like control keeps the same "Like video"
// label either way, and its liked state shows up as a class/style change on
// the icon plus the visible like count ticking up by one. Verifying via the
// count (rather than trying to read a CSS class, which is far more likely
// to silently break across a TikTok frontend deploy) is the more durable
// signal here, mirroring the same "only report success once the real state
// provably changed" rule Instagram's handler follows. data-e2e attributes
// are TikTok's own QA hooks and have stayed stable far longer than their
// obfuscated class names.
async function likeTikTok(page) {
  const likeButton = page.locator('[data-e2e="like-icon"], [data-e2e="browse-like-icon"]').first();
  const countEl = page.locator('[data-e2e="like-count"], [data-e2e="browse-like-count"]').first();

  if (!(await likeButton.isVisible().catch(() => false))) {
    return { liked: false, error: "Couldn't find a real Like button on this video's page." };
  }

  const ariaPressedBefore = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (ariaPressedBefore === "true") return { liked: true };
  const countBefore = await countEl.textContent().catch(() => null);

  await likeButton.click().catch(() => {});
  await sleep(1500);

  const ariaPressedAfter = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (ariaPressedAfter === "true") return { liked: true };

  const countAfter = await countEl.textContent().catch(() => null);
  if (countAfter !== null && countAfter !== countBefore) return { liked: true };

  return { liked: false, error: "Clicked Like, but TikTok's real button didn't confirm it." };
}

const LIKE_HANDLER = { instagram: likeInstagram, tiktok: likeTikTok };

// This process must never outlive Connector itself — otherwise quitting the
// app (by any means: normal quit, force-quit, crash) stops actually meaning
// "no live feed available," because a plain spawn() on the Rust side doesn't
// tie this child's lifetime to its parent. Polling for the parent PID is
// the robust way to enforce that regardless of *how* the parent went away:
// `kill(pid, 0)` sends no signal, it only reports whether the process still
// exists, and throws ESRCH the moment it doesn't.
const PARENT_PID = process.env.REELFORGE_PARENT_PID ? Number(process.env.REELFORGE_PARENT_PID) : null;
if (PARENT_PID) {
  setInterval(() => {
    try {
      process.kill(PARENT_PID, 0);
    } catch {
      console.log(`[session] parent process ${PARENT_PID} is gone — shutting down`);
      for (const session of sessions.values()) void session.close();
      process.exit(0);
    }
  }, 4000).unref();
}

/** @type {Map<string, Session>} */
const sessions = new Map();

class Session {
  constructor(id, secret, accountId, platform, browser, context, page) {
    this.id = id;
    this.secret = secret;
    this.accountId = accountId;
    this.platform = platform;
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.history = []; // reels already shown this session, in order
    this.cursor = -1;
    this.pending = []; // extracted-but-not-yet-shown, a natural read-ahead
    this.seenIds = new Set();
    this.lastHeartbeat = Date.now();
    this.closed = false;

    const domain = PLATFORM_DOMAIN[platform];
    const adapter = MEDIA_ADAPTER[platform];
    context.on("response", async (response) => {
      try {
        const url = response.url();
        if (!url.includes(domain)) return;
        const body = await response.json().catch(() => null);
        if (!body) return;
        const found = [];
        collectMediaFrom(body, found, this.seenIds, adapter);
        for (const item of found) {
          this.seenIds.add(item.id);
          this.pending.push(item);
        }
      } catch {
        // ignore
      }
    });
  }

  current() {
    return this.cursor >= 0 && this.cursor < this.history.length ? this.history[this.cursor] : null;
  }

  async ensurePending(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    if (this.pending.length > 0) return;
    // Nudge the real feed forward — this is the one moment "next" genuinely
    // touches the live Instagram session rather than replaying memory.
    await this.page.mouse.wheel(0, 1800).catch(() => {});
    while (this.pending.length === 0 && Date.now() < deadline) {
      await sleep(300);
    }
  }

  async next() {
    if (this.cursor < this.history.length - 1) {
      this.cursor += 1;
      return { reel: this.current(), fresh: false };
    }
    await this.ensurePending(4000);
    if (this.pending.length === 0) {
      // Try once more with a longer wait rather than reporting failure
      // immediately — Instagram's own response can just be slow.
      await this.ensurePending(4000);
    }
    if (this.pending.length === 0) return { reel: null, fresh: false };
    const reel = this.pending.shift();
    this.history.push(reel);
    this.cursor = this.history.length - 1;
    return { reel, fresh: true };
  }

  prev() {
    if (this.cursor > 0) this.cursor -= 1;
    return this.current();
  }

  async like() {
    const reel = this.current();
    if (!reel) return { liked: false, error: "No reel is currently in view." };

    // A real, separate page in the SAME authenticated context — this
    // reuses the session's real cookies without disturbing the Reels/For-You
    // tab's own scroll position (liking a reel the VA has scrolled back to
    // review shouldn't move the live feed out from under them).
    const likePage = await this.context.newPage();
    let result;
    try {
      await likePage.goto(reel.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await LIKE_HANDLER[this.platform](likePage);
    } catch (err) {
      result = { liked: false, error: err?.message ?? "Something went wrong while liking this reel." };
    } finally {
      await likePage.close().catch(() => {});
    }

    return result;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.browser.close().catch(() => {});
  }
}

async function startSession(accountId, token) {
  const sessionRes = await fetch(FETCH_SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, token }),
  });
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    throw new Error(sessionBody.error ?? "Couldn't load this account's session.");
  }
  const { platform, storageState } = sessionBody;
  if (!REEL_URL[platform]) throw new Error("This platform isn't supported for live research sessions yet.");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState, ...AUTOMATION_CONTEXT_OPTIONS });
  const page = await context.newPage();

  const id = randomUUID();
  const secret = randomUUID();
  const session = new Session(id, secret, accountId, platform, browser, context, page);
  sessions.set(id, session);
  console.log(`[session] started ${id} for account ${accountId} (${platform})`);

  try {
    await page.goto(REEL_URL[platform], { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    sessions.delete(id);
    await browser.close().catch(() => {});
    throw new Error("Couldn't open the real Reels session. Check your internet connection and try again.");
  }

  const { reel } = await session.next();
  // Makes the first reel's real provenance independently checkable from the
  // log alone — this is a brand-new page.goto() + scroll on a fresh
  // browser/context created above, never a replay of any prior session's
  // history (each Session instance's history/pending/seenIds start empty).
  console.log(`[session] ${id} first reel: ${reel ? `${reel.id} ${reel.sourceUrl}` : "(none — feed returned nothing)"}`);
  return { session, reel };
}

// Sessions nobody is heartbeating anymore get closed — a VA who just closes
// the tab (crash, force-quit, navigated away) never leaves a real logged-in
// browser sitting open indefinitely without knowing it.
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (!session.closed && now - session.lastHeartbeat > SESSION_TIMEOUT_MS) {
      console.log(`[session] ${session.id} timed out (no heartbeat for ${SESSION_TIMEOUT_MS}ms) — closing`);
      void session.close();
      sessions.delete(session.id);
    }
  }
}, 15000).unref();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function requireSession(res, id, secret) {
  const session = sessions.get(id);
  if (!session || session.closed || session.secret !== secret) {
    json(res, 403, { error: "This research session has ended. Reopen the account to start a new one." });
    return null;
  }
  session.lastHeartbeat = Date.now();
  return session;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 200, {});
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/sessions") {
      const { accountId, token } = await readBody(req);
      if (!accountId || !token) return json(res, 400, { error: "Missing required fields." });
      try {
        const { session, reel } = await startSession(accountId, token);
        return json(res, 200, { sessionId: session.id, sessionSecret: session.secret, reel });
      } catch (err) {
        return json(res, 502, { error: err?.message ?? "Couldn't start a research session." });
      }
    }

    const match = req.url?.match(/^\/sessions\/([^/]+)\/(next|prev|like|heartbeat|end)$/);
    if (req.method === "POST" && match) {
      const [, id, action] = match;
      const { sessionSecret } = await readBody(req);
      const session = requireSession(res, id, sessionSecret);
      if (!session) return;

      if (action === "next") {
        const { reel } = await session.next();
        return json(res, 200, { reel, hasPrev: session.cursor > 0 });
      }
      if (action === "prev") {
        const reel = session.prev();
        return json(res, 200, { reel, hasPrev: session.cursor > 0 });
      }
      if (action === "like") {
        const result = await session.like();
        return json(res, 200, result);
      }
      if (action === "heartbeat") {
        return json(res, 200, { ok: true });
      }
      if (action === "end") {
        console.log(`[session] ${id} ended explicitly`);
        await session.close();
        sessions.delete(id);
        return json(res, 200, { ok: true });
      }
    }

    json(res, 404, { error: "Not found." });
  } catch (err) {
    json(res, 500, { error: err?.message ?? "Unexpected error." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ReelForge Connector session server listening on 127.0.0.1:${PORT}`);
});
