# ReelForge Stable Product Baseline

**Established:** 2026-08-29 (superseded/extended same day — see revision note below)
**Client OS (this repo) HEAD:** `c5be603` — "Research Accounts: small polish pass (info popover, Archive engagement metrics)"
**Connector release:** `0.1.30` (unchanged from `e01d001` — this update touched only web app files, no `connector-app/**` changes, so no new Connector release was produced or needed)

This is the **first complete ReelForge stable baseline** — the original snapshot below (commit `e01d001`) plus one small, fully-verified Research Accounts polish pass on top. It is a point-in-time documentation snapshot, not a code change. It exists so future V2/V3 work has a known-good reference to compare against — if a regression is reported, check it against the flows below before assuming a new bug. No cleanup, refactor, or architecture change was made to produce this document.

## How to read this document

Each flow below is tagged:
- **Verified** — confirmed working via a real, direct test (the user clicking through the actual flow, or an equivalent direct test) within a tracked session, with a commit reference.
- **Shipped** — present in the current codebase per git history, with no known open issue, but not independently re-audited to produce this baseline.

Entries also link back to persistent memory (`project_frozen_features.md`) where a fuller root-cause writeup exists.

---

## 1. Workspace (app shell)

**Shipped.** Sidebar sections: Dashboard, Creativity Hub, Research Accounts, Collections, Production, Library, Creators, Billing, Settings, Admin Dashboard. Team roles (Owner/Manager/VA) with real invite/role/remove flow (`dff9ff5`). No specific open issues tracked for the shell itself — current HEAD is the baseline.

## 2. Research Accounts

**Verified, frozen** (see `project_frozen_features` memory for full root-cause detail on each):
- **Block User** — confirmed reliable.
- **Archive** — retry-once-on-403 fix confirmed live-working.
- **Startup/lock lifecycle** (Start Connector → countdown → Start Research → active session → End Research → lock released, single-active-session-per-account locking across tabs/devices/users) — `a913845`, sequencing restored in `2a33e2e`.
- **Follow** — shipped, mirrors the verified Like pattern.
- **`resolve-live-session-token` auth gap** (Stability Audit #1) — fixed, lock-scoped capability secret.
- **Shared `sync_token` cross-flow race** (Stability Audit #3) — fixed, split into three independent tokens.
- **Duplicate reels + automatic FYP refill** — fixed, Connector `0.1.10` (`a26f47d`); verified via direct endpoint testing (39/39 unique reels over 50 swipes), not yet independently re-clicked through the UI by the user at the time it shipped.
- **Live Research lock re-acquire race after End Research** — fixed (`36ec207`).
- **Comments V1** (read-only, 5s dwell, first visible batch only, per-comment like counts, no pagination) — shipped and verified real end-to-end against live Instagram data (`f64819c`).
- **Connector updater UX** (wake or already-running Connector → update check → clear "Updating…" state → real restart → fresh Connector → Research continues automatically, no second click, never the generic failure state) — verified real end-to-end today (`17da045`, `5d319ce`, `e01d001`, Connector `0.1.30`).
- **Research Accounts info popover** — small info icon next to the page title, hover/click popover explaining supported training signals (likes/follows/blocks), the current watch-time limitation, and the pre-training recommendation (`c5be603`).
- **Archive engagement metrics (Likes + Comments)** — shown on each Archive card, both confirmed 100% reliably persisted for archived reels via direct DB inspection (937/937 and 950/950 real rows respectively). Views was investigated and deliberately excluded: real testing (DOM text and network responses on the reel's own permalink page) confirmed Instagram essentially never exposes a real view count for Reels — 0 of 937 archived rows ever had one. Scoped to Archive only via a `showEngagement` prop on the shared `VideoCard`/`VideoGrid`; Creativity Hub is unaffected (`c5be603`).
- **Archive card bottom-info spacing** — smaller bottom inset than other cards using the same component, since Archive never fills the tags/fit row Hub cards often do; purely a spacing nudge (`c5be603`).

**Documented, not fixed:**
- Older Archive reels lose in-app playback once their CDN-signed URL expires (falls back to "Watch on Instagram") — accepted product limitation, decided against fixing pre-launch.
- Reels reappearing across separate fresh sessions on the same Instagram account — investigated and confirmed as Instagram's own server-side ranking behavior, not a client-side storage bug; decided not to "fix."

## 3. Connector

**Current release:** `0.1.30` (`e01d001`).

**Shipped / verified:**
- macOS drives the VA's own installed Google Chrome (`channel: "chrome"`), not a bundled Chromium — eliminated the prior notarization blocker entirely. Signed, notarized, and stapled (confirmed via `codesign`/`spctl`/`stapler validate` on release `0.1.25`).
- Universal (arm64 + x86_64) bundled Node runtime (fixed a "Bad CPU type" regression).
- Dev/prod identity separation: `net.reelforge.connector` vs `net.reelforge.connector.dev` bundle IDs and URL schemes.
- Auto-updater: rolling `connector-latest` GitHub release, version `0.1.<CI run number>`, built by `.github/workflows/connector-build.yml` on every push touching `connector-app/**`. Update-in-progress state is now signalled end-to-end (see Research Accounts above) and survives the restart race that previously crashed the freshly-updated session server.
- Windows still bundles its own Chromium (unaffected by the macOS system-Chrome change — no notarization equivalent needed there).

**Known, not yet resolved (tracked in memory, not part of this baseline's verified set):**
- Unconfirmed report of the download flow auto-triggering under some condition — a plausible mechanism was identified but not fixed, and it has no reproduction yet (`project_connector_download_lead` memory).
- No notarization-equivalent hardening gap beyond what's already fixed; Gatekeeper behaves normally on the current signed/notarized build.

## 4. Collections

**Shipped:**
- Collection status badge correctly derives "In Progress" / "Cancelled" / "Completed" from the latest submission (`bc7df12`, `ee1b8e0`).
- Redundant production-status badge removed from the overview row (`cde5484`).
- "Send to ReelForge" is now awaited end-to-end — no false success on failure, double-click-safe (`38436ee`).
- Numbered versions collapse into one folder with a hover version-switcher (`19cf415`).
- Delivered batches split into a separate, locked read-only view (`38494d9`).
- Assign-to-creator popover clipping fixed (`d4591c2`); a saved reel can be reassigned/shared across creators (`8f9cdfd`); every creator automatically gets a "Quick Saves" collection (`ea39b44`); click-to-play from Hub saves (`8f2a258`); stale collection version / automatic status fixes (`59dc070`); duplicate version numbers fixed, whole-family Archive added (`f0615a7`).

No further audit was performed on this area to produce this baseline beyond the git history above — current HEAD is the baseline.

## 5. Production

**Shipped:**
- Production Status: ETA + Cancelled status, notifications, clearer tags (`9c31801`).
- Made a real sidebar page (`d1ec23c`).
- Real-thumbnail + click-to-play video parity with Library (`a3eea5d`).

No specific bug audit was performed on this area to produce this baseline — current HEAD is the baseline.

## 6. Library

**Shipped:**
- Real-thumbnail + click-to-play video, same as Production (`a3eea5d`).
- Finished work restructured into a batch-first (grid → item detail) flow (`19cf415`).
- Gradient thumbnail fallback everywhere a real thumbnail isn't available (`ca458e5`).

No specific bug audit was performed on this area to produce this baseline — current HEAD is the baseline.

---

## Using this baseline

- Before treating a report as a new bug, check whether it touches a flow marked **Verified** above — if so, the root cause is very unlikely to be a reintroduction of an already-fixed issue; look for a new trigger instead.
- Research Accounts, Connector updater/session/lock, and the startup/lock lifecycle are explicitly **frozen** (see `project_frozen_features` memory) — any change touching that code should be flagged before modification, not made silently.
- This document reflects commit `c5be603` / Connector `0.1.30` as of 2026-08-29. It is not evergreen — update it explicitly the next time the user establishes a new baseline, rather than assuming it still applies after significant future changes.
