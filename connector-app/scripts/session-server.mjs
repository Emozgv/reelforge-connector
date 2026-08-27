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
const SUBMIT_LIVE_REEL_URL = process.env.REELFORGE_SUBMIT_LIVE_REEL_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-live-reel";
const RESOLVE_TOKEN_URL = process.env.REELFORGE_RESOLVE_TOKEN_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/resolve-live-session-token";

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

// A real Follow on the actual connected account, same rule as Like/Block:
// only report success once the platform's own UI provably confirms it, not
// just because a click was dispatched. Runs on the reel's own page (same
// page Like already uses) since both Instagram and TikTok show the
// Follow/Following control right in that page's header — no separate
// profile-page navigation needed the way Block requires.
async function followInstagram(page) {
  async function isFollowingVisible() {
    if (await page.getByRole("button", { name: "Following", exact: true }).first().isVisible().catch(() => false)) return true;
    return page.getByRole("button", { name: "Requested", exact: true }).first().isVisible().catch(() => false);
  }
  if (await isFollowingVisible()) return { following: true };
  const followButton = page.getByRole("button", { name: "Follow", exact: true }).first();
  if (!(await followButton.isVisible().catch(() => false))) {
    return { following: false, error: "Couldn't find a real Follow button on this reel's page." };
  }
  await followButton.click();
  await sleep(1500);
  const following = await isFollowingVisible();
  return following ? { following: true } : { following: false, error: "Clicked Follow, but Instagram's real button didn't confirm it." };
}

// TikTok's follow control on a video page carries a stable data-e2e hook
// (same convention as its like button/count above) and its own text swaps
// to "Following"/"Friends" once the follow lands — checked the same way
// likeTikTok verifies via its like count, not a CSS class.
async function followTikTok(page) {
  const followButton = page.locator('[data-e2e="follow-button"], [data-e2e="browse-follow-icon"]').first();
  if (!(await followButton.isVisible().catch(() => false))) {
    return { following: false, error: "Couldn't find a real Follow button on this video's page." };
  }
  async function isFollowingText() {
    const text = await followButton.textContent().catch(() => null);
    return !!text && /following|friends/i.test(text);
  }
  if (await isFollowingText()) return { following: true };
  await followButton.click().catch(() => {});
  await sleep(1500);
  return (await isFollowingText())
    ? { following: true }
    : { following: false, error: "Clicked Follow, but TikTok's real button didn't confirm it." };
}

const FOLLOW_HANDLER = { instagram: followInstagram, tiktok: followTikTok };

// A genuine platform block — not a ReelForge-only blacklist. Runs on the
// creator's real profile page (not the reel), because that's where
// Instagram's/TikTok's own Block control actually lives. Same rule as
// Like: only ever report success once the platform's own UI provably
// confirms the block took effect, never just because a click was
// dispatched — a block silently not landing would be worse than an honest
// failure, since the VA would believe this creator's content is gone from
// recommendations when it isn't.
async function blockInstagram(page) {
  // Verified live against a real account: the block itself takes effect
  // immediately, but the confirm dialog's own state update lags slightly
  // behind — an exact-match check right after clicking confirm can miss a
  // genuinely-succeeded block. A case-insensitive fallback plus a longer
  // settle window (see the sleep before the final check below) is what
  // actually catches it reliably instead of reporting a false failure.
  async function isBlockedVisible() {
    if (await page.getByRole("button", { name: "Unblock", exact: true }).first().isVisible().catch(() => false)) return true;
    if (await page.getByText("Unblock", { exact: true }).first().isVisible().catch(() => false)) return true;
    return page.getByText(/unblock/i).first().isVisible().catch(() => false);
  }
  async function openOptionsMenu() {
    const optionsButton = page.getByRole("button", { name: "Options", exact: true }).first();
    if (await optionsButton.isVisible().catch(() => false)) {
      await optionsButton.click();
      return true;
    }
    const svgIcon = page.locator('svg[aria-label="Options" i]').first();
    if (await svgIcon.isVisible().catch(() => false)) {
      await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
        await svgIcon.click();
      });
      return true;
    }
    return false;
  }

  if (await isBlockedVisible()) return { blocked: true };
  if (!(await openOptionsMenu())) return { blocked: false, error: "Couldn't find this profile's Options menu." };
  await sleep(1000);

  // The menu's own "Block" item opens a confirmation dialog whose own
  // confirm button is also labeled "Block" — scoping to [role="dialog"]
  // for the second click is what tells them apart.
  const menuBlockItem = page.getByRole("button", { name: "Block", exact: true }).first();
  if (!(await menuBlockItem.isVisible().catch(() => false))) {
    return { blocked: false, error: "Couldn't find Block in this profile's Options menu." };
  }
  await menuBlockItem.click();
  await sleep(1000);

  const dialog = page.getByRole("dialog").first();
  const confirmButton = dialog.getByRole("button", { name: "Block", exact: true }).first();
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click();
  } else {
    // Some variants ask for a second confirmation step ("Yes, I'm sure").
    const secondConfirm = dialog.getByRole("button", { name: /yes|confirm/i }).first();
    if (await secondConfirm.isVisible().catch(() => false)) await secondConfirm.click();
    else return { blocked: false, error: "Couldn't find the Block confirmation button." };
  }

  await sleep(2500);
  let blocked = await isBlockedVisible();
  if (!blocked) {
    // Belt-and-suspenders: a full reload reflects the real server-side
    // state directly rather than waiting on the SPA's own re-render, which
    // is what live testing showed lagging behind the block actually having
    // already taken effect.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await sleep(1500);
    blocked = await isBlockedVisible();
  }
  return blocked ? { blocked: true } : { blocked: false, error: "Clicked Block, but Instagram's real profile didn't confirm it." };
}

// Not yet verified against a real, connected TikTok account (see the
// TikTok live-session work — no TikTok Research Account has actually been
// connected and tested end-to-end yet). Written to the same real-action,
// verify-before-reporting-success shape as Instagram's handler, using
// TikTok's own stable data-e2e QA hooks where they're documented to exist,
// but this needs a real account to confirm the selectors still match
// TikTok's current profile page before it can be trusted.
async function blockTikTok(page) {
  async function isBlockedVisible() {
    return page.getByText(/^unblock$/i).first().isVisible().catch(() => false);
  }
  async function openMoreMenu() {
    const moreButton = page.locator('[data-e2e="user-more-menu"], [data-e2e="user-more"]').first();
    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click();
      return true;
    }
    return false;
  }

  if (await isBlockedVisible()) return { blocked: true };
  if (!(await openMoreMenu())) return { blocked: false, error: "Couldn't find this profile's more-options menu." };
  await sleep(1000);

  const blockItem = page.locator('[data-e2e="block-icon"]').first().or(page.getByText(/^block$/i).first());
  if (!(await blockItem.isVisible().catch(() => false))) {
    return { blocked: false, error: "Couldn't find Block in this profile's menu." };
  }
  await blockItem.click();
  await sleep(1000);

  const confirmButton = page.getByRole("button", { name: /^block$/i }).first();
  if (await confirmButton.isVisible().catch(() => false)) await confirmButton.click();
  else return { blocked: false, error: "Couldn't find the Block confirmation button." };

  await sleep(1500);
  const blocked = await isBlockedVisible();
  return blocked ? { blocked: true } : { blocked: false, error: "Clicked Block, but TikTok's real profile didn't confirm it." };
}

const BLOCK_HANDLER = { instagram: blockInstagram, tiktok: blockTikTok };

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

// research_accounts.sync_token is a single shared column per account -- a
// second live session started for the same account (another tab, a
// reconnect, another staff member) overwrites it in the DB, silently
// invalidating this session's own cached token for every archive write from
// that point on. This used to be undetectable: the old version never
// checked the response status at all, so a 403 looked identical to success.
// Now: check res.ok, and on exactly one 403 retry with the account's
// CURRENT token (see resolve-live-session-token) -- no mint, no loop. A
// successful retry updates session.token so every later archive call this
// session reuses the fresh value instead of re-hitting the same 403 every
// time. Never blocks or slows the live feed either way -- still
// fire-and-forget from next()'s point of view.
async function submitLiveReel(accountId, token, reel) {
  return fetch(SUBMIT_LIVE_REEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, token, reel }),
  });
}

async function resolveCurrentSyncToken(accountId) {
  try {
    const res = await fetch(RESOLVE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && body.token ? body.token : null;
  } catch {
    return null;
  }
}

async function archiveLiveReel(session, reel) {
  try {
    let res = await submitLiveReel(session.accountId, session.token, reel);

    if (res.status === 403) {
      const freshToken = await resolveCurrentSyncToken(session.accountId);
      if (!freshToken) {
        console.error(`[archive] session ${session.id} reel ${reel.id}: token rejected (403) and no fresh token could be resolved.`);
        return;
      }
      res = await submitLiveReel(session.accountId, freshToken, reel);
      if (res.ok) session.token = freshToken;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[archive] session ${session.id} reel ${reel.id} failed (${res.status}): ${body.error ?? "(no error message)"}`);
    }
  } catch (err) {
    // A real network failure, not a rejected token -- archive is
    // cache/history only, never load-bearing for the live feed.
    console.error(`[archive] session ${session.id} reel ${reel.id} failed: ${err?.message ?? err}`);
  }
}

class Session {
  constructor(id, secret, accountId, platform, token, browser, context, page) {
    this.id = id;
    this.secret = secret;
    this.accountId = accountId;
    this.platform = platform;
    // Kept only to authenticate this session's own best-effort archive
    // writes for its whole lifetime (see archiveLiveReel) — the live feed
    // itself never depends on it again after the initial storageState
    // fetch in startSession().
    this.token = token;
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
    // The VA is now genuinely seeing this reel for the first time this
    // session — exactly the moment Archive is supposed to pick it up.
    // Fire-and-forget: never lets a slow/failed archive write hold up the
    // live feed the VA is actually looking at.
    void archiveLiveReel(this, reel);
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

  async follow() {
    const reel = this.current();
    if (!reel) return { following: false, error: "No reel is currently in view." };

    const followPage = await this.context.newPage();
    let result;
    try {
      await followPage.goto(reel.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await FOLLOW_HANDLER[this.platform](followPage);
    } catch (err) {
      result = { following: false, error: err?.message ?? "Something went wrong while following this creator." };
    } finally {
      await followPage.close().catch(() => {});
    }

    return result;
  }

  async block() {
    const reel = this.current();
    if (!reel || !reel.username) return { blocked: false, error: "No reel is currently in view." };

    const profileUrl = this.platform === "instagram"
      ? `https://www.instagram.com/${reel.username}/`
      : `https://www.tiktok.com/@${reel.username}`;

    const blockPage = await this.context.newPage();
    let result;
    try {
      await blockPage.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await BLOCK_HANDLER[this.platform](blockPage);
    } catch (err) {
      result = { blocked: false, error: err?.message ?? "Something went wrong while blocking this creator." };
    } finally {
      await blockPage.close().catch(() => {});
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
  // Diagnostic-only timing, no behavior change -- lets us see which of the
  // four real steps (Supabase session fetch, Chromium launch, page
  // navigation, first-reel polling) is actually slow on a given "Loading
  // your feed…" report, instead of guessing at a single timeout constant.
  const t0 = Date.now();
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
  console.log(`[timing] fetch-research-account-session: ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState, ...AUTOMATION_CONTEXT_OPTIONS });
  console.log(`[timing] chromium launch + context: ${Date.now() - t1}ms`);

  // TikTok specifically: storageState is a frozen snapshot (captured at
  // login, only ever refreshed by an explicit Resync) — every new session
  // otherwise replays that exact same localStorage every time, and TikTok's
  // web client keeps its own feed-continuation state in there, so it just
  // resumes from the same pinned point instead of seeding a real fresh For
  // You feed (confirmed as the cause of "same first reel every session").
  // Login itself lives in cookies (see hasRealSession, connect-worker.mjs),
  // never localStorage, so clearing it can't affect being logged in.
  // Instagram doesn't show this symptom and isn't touched.
  if (platform === "tiktok") {
    await context.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
  }

  const page = await context.newPage();

  const id = randomUUID();
  const secret = randomUUID();
  const session = new Session(id, secret, accountId, platform, token, browser, context, page);
  sessions.set(id, session);
  console.log(`[session] started ${id} for account ${accountId} (${platform})`);

  const t2 = Date.now();
  try {
    await page.goto(REEL_URL[platform], { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    sessions.delete(id);
    await browser.close().catch(() => {});
    throw new Error("Couldn't open the real Reels session. Check your internet connection and try again.");
  }
  console.log(`[timing] page.goto navigation: ${Date.now() - t2}ms`);

  const t3 = Date.now();
  const { reel } = await session.next();
  console.log(`[timing] first-reel polling (session.next): ${Date.now() - t3}ms`);
  console.log(`[timing] startSession total: ${Date.now() - t0}ms`);
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

    const match = req.url?.match(/^\/sessions\/([^/]+)\/(next|prev|like|follow|block|heartbeat|end)$/);
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
      if (action === "follow") {
        const result = await session.follow();
        if (!result.following) console.error(`[follow] session ${id} failed: ${result.error ?? "(no error message)"}`);
        return json(res, 200, result);
      }
      if (action === "block") {
        const result = await session.block();
        // Diagnostic-only, no behavior change -- block() already returns a
        // specific error string on failure, but nothing ever logged it, so
        // every failure looked identical from the outside ("Retry").
        if (!result.blocked) console.error(`[block] session ${id} failed: ${result.error ?? "(no error message)"}`);
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
