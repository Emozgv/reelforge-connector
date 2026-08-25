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

// The web app heartbeats every 15s; 45s tolerates a couple of missed beats
// (a brief network hiccup) without making a genuinely abandoned session
// (tab closed, beforeunload/pagehide didn't get a chance to fire) linger
// for what feels to a returning VA like "it's still running."
const SESSION_TIMEOUT_MS = 45 * 1000;
const REEL_URL = { instagram: "https://www.instagram.com/reels/" };

// Same reasoning as connect-worker.mjs: force English so the real Like
// button's accessible name ("Like"/"Unlike") is actually there to find,
// regardless of the host machine's own locale.
const AUTOMATION_CONTEXT_OPTIONS = {
  locale: "en-US",
  extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
};

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
      id: `instagram:${node.code}`,
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

function collectMediaFrom(node, out, seenIds, depth = 0) {
  if (depth > 24 || !node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaFrom(item, out, seenIds, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  if (looksLikeMedia(node)) {
    const parsed = parseMedia(node);
    if (parsed && !seenIds.has(parsed.id)) out.push(parsed);
  }
  for (const key of Object.keys(node)) collectMediaFrom(node[key], out, seenIds, depth + 1);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/** @type {Map<string, Session>} */
const sessions = new Map();

class Session {
  constructor(id, secret, accountId, browser, context, page) {
    this.id = id;
    this.secret = secret;
    this.accountId = accountId;
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.history = []; // reels already shown this session, in order
    this.cursor = -1;
    this.pending = []; // extracted-but-not-yet-shown, a natural read-ahead
    this.seenIds = new Set();
    this.lastHeartbeat = Date.now();
    this.closed = false;

    context.on("response", async (response) => {
      try {
        const url = response.url();
        if (!url.includes("instagram.com")) return;
        const body = await response.json().catch(() => null);
        if (!body) return;
        const found = [];
        collectMediaFrom(body, found, this.seenIds);
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
    // reuses the session's real cookies without disturbing the Reels tab's
    // own scroll position (liking a reel the VA has scrolled back to review
    // shouldn't move the live feed out from under them).
    const likePage = await this.context.newPage();
    let liked = false;
    let failureReason = null;
    try {
      await likePage.goto(reel.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);

      async function isUnlikedVisible() {
        if (await likePage.getByRole("button", { name: "Like", exact: true }).first().isVisible().catch(() => false)) return true;
        return likePage.locator('svg[aria-label="Like" i]').first().isVisible().catch(() => false);
      }
      async function isLikedVisible() {
        if (await likePage.getByRole("button", { name: "Unlike", exact: true }).first().isVisible().catch(() => false)) return true;
        return likePage.locator('svg[aria-label="Unlike" i]').first().isVisible().catch(() => false);
      }
      async function clickLike() {
        const roleButton = likePage.getByRole("button", { name: "Like", exact: true }).first();
        if (await roleButton.isVisible().catch(() => false)) {
          await roleButton.click();
          return true;
        }
        const svgIcon = likePage.locator('svg[aria-label="Like" i]').first();
        if (await svgIcon.isVisible().catch(() => false)) {
          await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
            await svgIcon.click();
          });
          return true;
        }
        return false;
      }

      if (await isLikedVisible()) {
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
    } finally {
      await likePage.close().catch(() => {});
    }

    return { liked, error: liked ? undefined : failureReason };
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
  const session = new Session(id, secret, accountId, browser, context, page);
  sessions.set(id, session);
  console.log(`[session] started ${id} for account ${accountId}`);

  try {
    await page.goto(REEL_URL[platform], { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    sessions.delete(id);
    await browser.close().catch(() => {});
    throw new Error("Couldn't open the real Reels session. Check your internet connection and try again.");
  }

  const { reel } = await session.next();
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
