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
// How low `pending` must drop (right after a fresh delivery) before
// maybePrefetch() below fires a background top-up. Deliberately not the
// smallest value that would technically work (1) -- the V1 goal is making
// batch boundaries feel invisible despite real, sometimes-long Instagram
// refill latency, not minimizing prefetch nudges. Real [trace-prefetch]
// evidence showed successful prefetches take ~41-57s even starting from 3,
// so 3 rarely bought enough head start against faster swiping -- 10 is the
// V1 balance between enough lead time to hide that latency more often and
// staying reasonably close to recent interaction signals (Likes/Follows)
// rather than preloading excessively far ahead. Still env-overridable for
// local comparison if real usage ever shows a concrete reason to revisit it.
const PREFETCH_LOW_WATER_MARK = Number(process.env.REELFORGE_PREFETCH_THRESHOLD ?? 10);
// How long maybePrefetch() below keeps re-nudging (ArrowDown, then poll)
// before giving up, once triggered. Based on real [trace] evidence from an
// actual Connector run (session-server.log): once a batch was genuinely
// exhausted, real recovery took 7-8 consecutive nudge-and-wait cycles
// spread across roughly 60-70s before Instagram served anything new --
// nowhere close to the single ~4-8s attempt the original ensurePending()
// design assumed. 90s gives real margin above that observed worst case
// without looping indefinitely. Each cycle reuses ensurePending(4000)
// completely unmodified, so the actual nudge cadence (~1 press per ~4s)
// matches what was observed to eventually work.
const PREFETCH_MAX_DURATION_MS = 90_000;

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

// macOS doesn't bundle a downloaded Chromium (see prepare-bundled-runtime.mjs
// and connect-worker.mjs's IS_MAC — same reasoning) — every live Research
// session instead drives the VA's own already-installed Google Chrome.
// Windows keeps the bundled Chromium exactly as before.
const IS_MAC = process.platform === "darwin";

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

function collectMediaFrom(node, out, seenIds, adapter, depth = 0, stats) {
  if (depth > 24 || !node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaFrom(item, out, seenIds, adapter, depth + 1, stats);
    return;
  }
  if (typeof node !== "object") return;
  if (adapter.looksLikeMedia(node)) {
    const parsed = adapter.parseMedia(node);
    if (parsed) {
      // DIAGNOSTIC (temporary): stats is only ever passed by the trace
      // instrumentation below -- no behavior change when omitted.
      if (stats) stats.candidates++;
      if (!seenIds.has(parsed.id)) {
        out.push(parsed);
      } else if (stats) {
        stats.rejected++;
        stats.rejectedIds.push(parsed.id);
      }
    }
  }
  for (const key of Object.keys(node)) collectMediaFrom(node[key], out, seenIds, adapter, depth + 1, stats);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

// Comments are read-only in ReelForge and only ever fetched on demand (see
// Session.comments() below). Four real attempts at sniffing Instagram's own
// network traffic for a comments-shaped response never found one — every
// GraphQL call captured was ordinary feed/clips pagination, not comments,
// and nothing in the traffic was ever named or shaped like comment data.
// Rather than keep guessing at Instagram's private API, this parses the
// page's OWN rendered text instead (see Session.comments(), which diffs
// document.body.innerText before/after opening the panel — whatever's new
// on screen IS the comment content by definition). Real Instagram comment
// rendering puts each commenter's username alone on its own line
// (usernames can only contain letters/digits/periods/underscores, so
// that's a reliable-enough marker), followed by the comment text, followed
// by metadata lines (timestamp, like count, "Reply") that aren't part of
// the comment itself and get filtered out here.
const USERNAME_LINE_RE = /^[a-zA-Z0-9_.]{1,30}$/;
// A relative-timeago token ("1w", "2h", "3d") immediately follows every real
// username line in Instagram's rendered comment list -- unlike the username
// pattern alone (which e.g. the panel's own "Comments" header also matches),
// this pair reliably confirms a line actually starts a new comment. Verified
// against a real captured comment list (reel instagram:DcHVbYbRCWj) before
// shipping this pattern.
const TIMEAGO_LINE_RE = /^\d+\s*[hdwmy]$/i;
// Comma-grouped counts ("12,565 likes") need their own pattern -- \d+ alone
// doesn't span the comma, so a plain \d+-based check silently fails to
// recognize these as metadata and lets them leak into comment text instead.
const LIKE_COUNT_LINE_RE = /^([\d,]+)\s*(like|likes)$/i;
const METADATA_LINE_RE = /^(\d+\s*[hdwmy]|[\d,]+\s*(like|likes)|verified|reply|view (all|replies).*|•)$/i;

function isCommentStart(lines, index) {
  return USERNAME_LINE_RE.test(lines[index] ?? "") && TIMEAGO_LINE_RE.test(lines[index + 1] ?? "");
}

function parseCommentLines(lines) {
  const comments = [];
  let i = 0;
  while (i < lines.length) {
    if (!isCommentStart(lines, i)) {
      i++;
      continue;
    }
    const username = lines[i];
    let j = i + 2; // skip the username and its timeago line
    const textParts = [];
    // The like count, when Instagram shows one, always renders as the first
    // metadata line right after a comment's text (before "Reply"/"View
    // replies") -- confirmed across every real captured sample. Only that
    // first metadata line is ever checked, so a later unrelated number
    // (e.g. from "View all N replies") can never be mistaken for it.
    let likeCount = null;
    let sawMetadata = false;
    while (j < lines.length && !isCommentStart(lines, j) && textParts.length < 5) {
      const line = lines[j];
      if (METADATA_LINE_RE.test(line)) {
        if (!sawMetadata) {
          const match = line.match(LIKE_COUNT_LINE_RE);
          if (match) likeCount = parseInt(match[1].replace(/,/g, ""), 10);
          sawMetadata = true;
        }
      } else {
        textParts.push(line);
      }
      j++;
    }
    const text = textParts.join(" ").trim();
    if (text) comments.push({ id: `${username}-${i}`, username, text, postedAt: null, likeCount });
    i = j > i ? j : i + 1;
  }
  return comments;
}

// Best-effort click to open each platform's own native comments panel —
// same accessible-name/attribute pattern already used for Like above.
// Never throws: a failed click just means no comments response gets
// sniffed, which Session.comments() below already treats as "unavailable"
// rather than an error.
async function openInstagramComments(page) {
  const commentIcon = page.locator('svg[aria-label="Comment" i]').first();
  if (!(await commentIcon.isVisible().catch(() => false))) return { found: false, clicked: false };
  let clicked = true;
  await commentIcon
    .locator("xpath=ancestor::*[@role='button' or self::button][1]")
    .first()
    .click()
    .catch(async () => {
      await commentIcon.click().catch(() => {
        clicked = false;
      });
    });
  return { found: true, clicked };
}

async function openTikTokComments(page) {
  const commentIcon = page.locator('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]').first();
  const found = await commentIcon.isVisible().catch(() => false);
  let clicked = false;
  if (found) clicked = await commentIcon.click().then(() => true).catch(() => false);
  return { found, clicked };
}

const COMMENTS_OPEN_HANDLER = { instagram: openInstagramComments, tiktok: openTikTokComments };

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

// Set only via POST /update-status (lib.rs's spawn_update_check) -- see
// that route and /health above. Always starts false: a fresh process (the
// normal case, and also what a post-restart relaunch is) never carries a
// stale "updating" flag over from before.
let connectorUpdating = false;

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

async function resolveCurrentSyncToken(accountId, lockSecret) {
  try {
    const res = await fetch(RESOLVE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, lockSecret }),
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
      const freshToken = await resolveCurrentSyncToken(session.accountId, session.lockSecret);
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
  constructor(id, secret, accountId, platform, token, lockSecret, browser, context, page, initialSeenIds) {
    this.id = id;
    this.secret = secret;
    this.accountId = accountId;
    this.platform = platform;
    // Kept only to authenticate this session's own best-effort archive
    // writes for its whole lifetime (see archiveLiveReel) — the live feed
    // itself never depends on it again after the initial storageState
    // fetch in startSession().
    this.token = token;
    // The capability minted alongside this account's live-research lock —
    // proves to resolve-live-session-token that this session actually
    // holds the lock, not just that some session exists for the account.
    // Only ever needed for the token-recovery retry in archiveLiveReel.
    this.lockSecret = lockSecret;
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.history = []; // reels already shown this session, in order
    this.cursor = -1;
    this.pending = []; // extracted-but-not-yet-shown, a natural read-ahead
    // Seeded from Archive's own permanent record (research_feed_items), not
    // just this Session instance's own memory -- Archive already knows every
    // reel id ever shown for this account, across every past session, so a
    // reel Instagram re-serves (same continuous session after a silent
    // recovery, or a brand new session days later) gets rejected here before
    // it ever reaches pending, the same way an id this Session itself
    // already showed always has been. Falls back to empty exactly like
    // before if the caller has nothing to seed with (e.g. a genuinely new
    // account, or the archive lookup failing) -- never a behavior change on
    // its own, only ever narrows what gets shown.
    this.seenIds = new Set(initialSeenIds ?? []);
    this.lastHeartbeat = Date.now();
    this.closed = false;
    // Guards maybePrefetch() so at most one background top-up is ever in
    // flight per session -- see maybePrefetch() below.
    this.prefetching = false;

    const domain = PLATFORM_DOMAIN[platform];
    const adapter = MEDIA_ADAPTER[platform];
    context.on("response", async (response) => {
      try {
        const url = response.url();
        if (!url.includes(domain)) return;
        const body = await response.json().catch(() => null);
        if (!body) return;
        const found = [];
        // DIAGNOSTIC (temporary): proves the seenIds filter is actively
        // rejecting candidates (from this session's own history, or seeded
        // from Archive), not just that Instagram happened not to re-serve
        // anything already known this time.
        const stats = { candidates: 0, rejected: 0, rejectedIds: [] };
        collectMediaFrom(body, found, this.seenIds, adapter, 0, stats);
        if (stats.rejected > 0) {
          console.log(`[trace-reject] session ${this.id}: response had ${stats.candidates} candidate(s), REJECTED ${stats.rejected} already-seen id(s): ${stats.rejectedIds.join(", ")}`);
        }
        // DIAGNOSTIC (temporary): does a single response ever contain the
        // same id twice before seenIds gets updated below? collectMediaFrom
        // only checks against seenIds as it walks, not against `found`
        // itself, so this is the one place a same-response internal
        // duplicate could slip past undetected.
        const idsThisResponse = found.map((f) => f.id);
        const internalDupes = idsThisResponse.filter((id, i) => idsThisResponse.indexOf(id) !== i);
        if (internalDupes.length > 0) {
          console.error(`[trace-dup] session ${this.id}: response itself contained duplicate id(s) within one body: ${[...new Set(internalDupes)].join(", ")} (url=${url.slice(0, 80)})`);
        }
        if (found.length > 0) {
          console.log(`[trace] session ${this.id}: response -> ${found.length} new id(s): ${idsThisResponse.join(", ")}`);
        }
        for (const item of found) {
          // DIAGNOSTIC (temporary): pending should never already contain
          // this id if seenIds is doing its job -- direct sanity check.
          if (this.pending.some((p) => p.id === item.id)) {
            console.error(`[trace-dup] session ${this.id}: ${item.id} was about to be pushed to pending but is ALREADY in pending`);
          }
          this.seenIds.add(item.id);
          this.pending.push(item);
        }
      } catch (err) {
        console.error(`[trace-error] session ${this.id}: response handler failed: ${err?.message ?? err}`);
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
    // touches the live Instagram session rather than replaying memory. Real
    // per-reel navigation (ArrowDown), not a raw wheel-scroll jump: directly
    // confirmed that repeated identical wheel jumps plateau after the first
    // batch or two regardless of how many times they're repeated, while
    // real per-reel navigation reliably triggers Instagram's own
    // threshold-based FYP refill as it's exercised further into the
    // currently loaded set -- matching how a genuine viewer actually
    // advances, not an arbitrary large scroll delta.
    await this.page.keyboard.press("ArrowDown").catch(() => {});
    while (this.pending.length === 0 && Date.now() < deadline) {
      await sleep(300);
    }
  }

  // Best-effort, fire-and-forget: called right after next() delivers a
  // fresh reel, so the *next* time the VA reaches the end of pending,
  // pending may already be topped up and next() returns instantly instead
  // of making them wait through a live refill. Never awaited by next()/the
  // HTTP handler, and failure here is completely invisible to the VA.
  //
  // Deliberately does NOT call ensurePending() -- that function only ever
  // nudges when `pending` is fully empty (`if (this.pending.length > 0)
  // return`), which is right for a real next() call (no need to nudge if
  // there's already something to serve) but wrong here: maybePrefetch is
  // meant to start EARLY, while pending still has up to
  // PREFETCH_LOW_WATER_MARK items left, specifically to get ahead of
  // exhaustion. Routing through ensurePending's own guard would make it a
  // silent no-op until pending hit literal 0, defeating the whole point of
  // triggering early. So this presses ArrowDown itself (same primitive,
  // same real per-reel navigation ensurePending uses -- see its own
  // comment above) and polls for `pending` to grow past whatever it was
  // when this started, not just "become non-zero".
  //
  // Keeps re-nudging every ~4s for up to PREFETCH_MAX_DURATION_MS instead
  // of trying once and giving up, because real [trace] evidence showed a
  // single ~4-8s attempt is nowhere near enough: genuine post-exhaustion
  // recovery took 7-8 such cycles over ~60-70s in an actual session. Stops
  // the instant pending grows (from this loop, or from anything else --
  // e.g. a real next() call's own nudge landing a response first, which
  // races harmlessly with this) or the session closes -- never spins past
  // either.
  maybePrefetch() {
    if (this.closed || this.prefetching || this.pending.length > PREFETCH_LOW_WATER_MARK) return;
    this.prefetching = true;
    const startedAt = Date.now();
    const deadline = startedAt + PREFETCH_MAX_DURATION_MS;
    const startingPendingCount = this.pending.length;
    console.log(`[trace-prefetch] session ${this.id}: buffer low (pending=${startingPendingCount}, threshold=${PREFETCH_LOW_WATER_MARK}), starting background prefetch (bounded ${PREFETCH_MAX_DURATION_MS}ms)`);
    (async () => {
      try {
        while (!this.closed && this.pending.length <= startingPendingCount && Date.now() < deadline) {
          await this.page.keyboard.press("ArrowDown").catch(() => {});
          const cycleDeadline = Math.min(deadline, Date.now() + 4000);
          while (!this.closed && this.pending.length <= startingPendingCount && Date.now() < cycleDeadline) {
            await sleep(300);
          }
        }
        if (this.pending.length > startingPendingCount) {
          console.log(`[trace-prefetch] session ${this.id}: prefetch succeeded after ${Date.now() - startedAt}ms, pending=${this.pending.length}`);
        } else if (this.closed) {
          console.log(`[trace-prefetch] session ${this.id}: prefetch stopped after ${Date.now() - startedAt}ms -- session closed`);
        } else {
          console.log(`[trace-prefetch] session ${this.id}: prefetch gave up after ${Date.now() - startedAt}ms (bounded window exhausted), pending still at ${this.pending.length} -- normal refill path is unaffected`);
        }
      } catch (err) {
        // Same "best-effort, never lets this take anything else down"
        // shape as archiveLiveReel/releaseLock elsewhere in this file --
        // most relevant case is the session closing (browser.close())
        // mid-loop.
        console.log(`[trace-prefetch] session ${this.id}: prefetch failed (${err?.message ?? err}) -- normal refill path is unaffected`);
      } finally {
        this.prefetching = false;
      }
    })();
  }

  async next() {
    if (this.cursor < this.history.length - 1) {
      this.cursor += 1;
      const reel = this.current();
      console.log(`[trace] session ${this.id} next(): REWIND to ${reel?.id} at history position ${this.cursor} (fresh=false, this is the user's own prev/next replay, not a new capture)`);
      return { reel, fresh: false };
    }
    const t0 = Date.now();
    await this.ensurePending(4000);
    let waitedTwice = false;
    if (this.pending.length === 0) {
      // Try once more with a longer wait rather than reporting failure
      // immediately — Instagram's own response can just be slow.
      waitedTwice = true;
      await this.ensurePending(4000);
    }
    if (this.pending.length === 0) {
      console.log(`[trace] session ${this.id} next(): feed exhausted after ${Date.now() - t0}ms (waitedTwice=${waitedTwice}), pending still empty, history so far=${this.history.length}`);
      return { reel: null, fresh: false };
    }
    const reel = this.pending.shift();
    // DIAGNOSTIC (temporary): the ground-truth check -- has this exact id
    // ever been delivered before in this Session's history? seenIds/pending
    // should make this structurally impossible, but this proves it directly
    // rather than assuming the upstream guards are airtight.
    const priorIndex = this.history.findIndex((h) => h.id === reel.id);
    if (priorIndex !== -1) {
      console.error(`[trace-dup] session ${this.id}: DUPLICATE DELIVERED -- ${reel.id} was already shown at history position ${priorIndex}, now being delivered again at position ${this.history.length} (gap: ${this.history.length - priorIndex})`);
    }
    this.history.push(reel);
    this.cursor = this.history.length - 1;
    console.log(`[trace] session ${this.id} next(): delivered ${reel.id} at history position ${this.cursor} (fresh=true, waitedMs=${Date.now() - t0}, pendingRemaining=${this.pending.length})`);
    // The VA is now genuinely seeing this reel for the first time this
    // session — exactly the moment Archive is supposed to pick it up.
    // Fire-and-forget: never lets a slow/failed archive write hold up the
    // live feed the VA is actually looking at.
    void archiveLiveReel(this, reel);
    this.maybePrefetch();
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

  // Read-only, on-demand only (see the web app's CommentsPanel — it only
  // calls this once the VA has stayed on a reel for a few seconds with the
  // panel open, never for every reel while scrolling). A real, separate
  // page in the same authenticated context, exactly like like()/follow()/
  // block() above — the live Reels/For-You tab's own scroll position is
  // never touched. `reelId`/`sourceUrl` come from the client's own
  // already-known current reel rather than this.current(), so a slow
  // fetch that resolves after the VA has already moved on can't silently
  // attach comments to the wrong reel — the client checks the id itself.
  async comments(reelId, sourceUrl) {
    if (!sourceUrl) return { available: false, comments: [] };

    // Real network sniffing (four live attempts) never found a
    // "/comment"-named endpoint, and every GraphQL response seen turned out
    // to be ordinary feed/clips pagination -- Instagram's private API
    // shape for this isn't something worth continuing to guess at. This
    // reads whatever the VA would actually SEE instead: opens the same
    // real comments panel Like/Follow already click into on this exact
    // page, and diffs the page's own rendered text before vs. after
    // opening it. Whatever's new on screen IS the comments content by
    // definition, with zero assumption about Instagram's internal API or
    // DOM class names (which are obfuscated and rotate) -- the same
    // "trust only what's provably true, not what a click probably did"
    // rule Like/Follow already follow, just applied to reading instead of
    // clicking.
    const commentsPage = await this.context.newPage();
    try {
      await commentsPage.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(1500);

      const beforeText = await commentsPage.evaluate(() => document.body.innerText).catch(() => "");
      const openResult = await COMMENTS_OPEN_HANDLER[this.platform](commentsPage).catch(() => ({ found: false, clicked: false }));
      if (!openResult.found || !openResult.clicked) {
        return { available: false, comments: [] };
      }

      await sleep(3000);
      const afterText = await commentsPage.evaluate(() => document.body.innerText).catch(() => "");

      const beforeLines = new Set(beforeText.split("\n").map((l) => l.trim()).filter(Boolean));
      const newLines = afterText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !beforeLines.has(l));

      const comments = parseCommentLines(newLines);

      // Going beyond this first batch was investigated and dropped: scrolling
      // the comment thread's own container -- even anchored to a DOM node
      // holding a real, already-extracted comment -- reliably surfaced
      // unrelated feed content (other reels' captions/like counts) instead of
      // more of the same thread, across two independent real reels; and no
      // stable native "load more comments" control (button/link, as opposed
      // to scroll-triggered pagination) was found in the opened panel either.
      // So this only ever returns the first batch that's already visible
      // when the panel opens -- typically 8-10 top-level comments in real
      // testing, occasionally fewer.
      if (comments.length === 0) return { available: false, comments: [] };
      return { available: true, comments: comments.slice(0, 50), reelId };
    } catch (err) {
      console.error(`[comments] reel ${reelId}: ${err?.message}`);
      return { available: false, comments: [], error: err?.message ?? "Couldn't load comments for this reel." };
    } finally {
      await commentsPage.close().catch(() => {});
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.browser.close().catch(() => {});
  }
}

async function startSession(accountId, token, lockSecret) {
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
  const { platform, storageState, seenReelIds } = sessionBody;
  if (!REEL_URL[platform]) throw new Error("This platform isn't supported for live research sessions yet.");
  console.log(`[timing] fetch-research-account-session: ${Date.now() - t0}ms`);
  console.log(`[session] account ${accountId}: seeding with ${seenReelIds?.length ?? 0} already-archived id(s)`);

  const t1 = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(IS_MAC ? { channel: "chrome" } : {}) });
  } catch (err) {
    if (IS_MAC) {
      throw new Error("Research needs Google Chrome installed on this Mac. Install Chrome, then try again.");
    }
    throw err;
  }
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
  const session = new Session(id, secret, accountId, platform, token, lockSecret, browser, context, page, seenReelIds);
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
      console.log(`[session] ${session.id} (account ${session.accountId}) timed out (no heartbeat for ${SESSION_TIMEOUT_MS}ms) — closing, delivered ${session.history.length} reel(s) this session`);
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
      // activeSessions lets the Connector's own updater (see lib.rs's
      // spawn_update_check) know whether it's safe to restart right now --
      // a genuine addition to what /health already reports, not a new
      // endpoint or a change to what any existing caller (the web app's own
      // checkHealth()) already does with this response. `updating` is the
      // reverse direction of the same idea: lib.rs posts to /update-status
      // (below) right before it actually starts installing an update it's
      // already decided is safe to install now, so the web app can show a
      // clear "Connector is updating" state instead of misreading the
      // restart that follows as a generic failure.
      json(res, 200, { ok: true, activeSessions: sessions.size, updating: connectorUpdating });
      return;
    }

    if (req.method === "POST" && req.url === "/update-status") {
      // Local-only signal from lib.rs, not from the web app -- no
      // sessionSecret to check, same trust level as this server itself
      // (both only ever bind 127.0.0.1). Never touches sessions/locks.
      const { updating } = await readBody(req);
      connectorUpdating = !!updating;
      console.log(`[update] connectorUpdating=${connectorUpdating}`);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/sessions") {
      const { accountId, token, lockSecret } = await readBody(req);
      if (!accountId || !token) return json(res, 400, { error: "Missing required fields." });
      try {
        const { session, reel } = await startSession(accountId, token, lockSecret);
        return json(res, 200, { sessionId: session.id, sessionSecret: session.secret, reel });
      } catch (err) {
        return json(res, 502, { error: err?.message ?? "Couldn't start a research session." });
      }
    }

    const match = req.url?.match(/^\/sessions\/([^/]+)\/(next|prev|like|follow|block|comments|heartbeat|end)$/);
    if (req.method === "POST" && match) {
      const [, id, action] = match;
      const { sessionSecret, reelId, sourceUrl } = await readBody(req);
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
      if (action === "comments") {
        const result = await session.comments(reelId, sourceUrl);
        if (!result.available) console.error(`[comments] session ${id} unavailable for reel ${reelId ?? "(unknown)"}: ${result.error ?? "no comments response captured"}`);
        return json(res, 200, result);
      }
      if (action === "heartbeat") {
        return json(res, 200, { ok: true });
      }
      if (action === "end") {
        console.log(`[session] ${id} (account ${session.accountId}) ended explicitly, delivered ${session.history.length} reel(s) this session`);
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

// An update's restart kills the old Connector process and relaunches the
// new one almost immediately -- far faster than the OLD process's own
// orphaned session-server child can notice (it only polls for its parent's
// death every 4000ms, see PARENT_PID above) and free this exact port. Real
// testing of the update flow (see lib.rs's spawn_update_check) hit this
// directly: the new process's one and only listen() attempt landed on the
// still-held port, and with no error handler an unhandled 'error' event
// crashed this whole process outright -- leaving the freshly-updated
// Connector with no live session server at all, forever, since nothing
// here ever retried. Retrying for up to twice the old child's own poll
// interval is what actually recovers instead of crashing on this race.
function bindSessionServer(deadline) {
  function onError(err) {
    if (err.code === "EADDRINUSE" && Date.now() < deadline) {
      setTimeout(() => bindSessionServer(deadline), 500);
      return;
    }
    throw err;
  }
  server.once("error", onError);
  server.listen(PORT, "127.0.0.1", () => {
    server.removeListener("error", onError);
    console.log(`ReelForge Connector session server listening on 127.0.0.1:${PORT}`);
  });
}

bindSessionServer(Date.now() + 8000);
