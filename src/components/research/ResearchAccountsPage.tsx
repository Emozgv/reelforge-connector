import { useEffect, useMemo, useRef, useState } from "react";
import { Auftritt } from "../shared/v3";
import { KOPF_ABSTAND, KOPF_KUERZEL, KOPF_TITEL, KOPF_UNTERZEILE } from "../../lib/pageHeader";
import { feedAuffrischen, quelleLesen, quelleWechseln } from "./LiveBuehne";
import {
  Plus,
  X,
  Users,
  LayoutGrid,
  Play,
  Check,
  Loader2,
  RotateCw,
  Info,
  RefreshCw,
  Square,
  CheckCircle2,
  StickyNote,
  FolderOpen,
  Bookmark,
  Diamond,
  // Die Zeichen fuer die Kennzahlen des laufenden Reels. Bewusst aus
  // demselben Satz wie der Rest der Oberflaeche -- gleiche Strichstaerke,
  // gleiche Rundungen. Ein fremder Satz (oder Emoji) faellt sofort auf.
  Flame,
  Heart,
  MessageCircle,
  Repeat2,
  Eye,
  Timer,
  CalendarDays,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatViews, formatDuration } from "../../lib/researchFeedMapping";
import { supabase } from "../../lib/supabase";
import { researchFeedItemToVideo, type ResearchFeedItemRow } from "../../lib/researchFeedMapping";
import type { Creator, Platform, ReelVideo, ResearchAccount } from "../../types";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { ConnectStart, ResearchAccountsStore } from "../../state/useResearchAccounts";
import { MAX_RESEARCH_ACCOUNTS_PER_PLATFORM } from "../../state/useResearchAccounts";
import { useLiveResearchSession, type LiveSessionStatus } from "../../state/useLiveResearchSession";
import { CreatorSelector } from "../hub/CreatorSelector";
import { PlatformIcon } from "../hub/PlatformIcon";
import { VideoGrid } from "../hub/VideoGrid";
import { SavePanel } from "../hub/SavePanel";
import { SavedCollectionsPopover } from "../hub/SavedCollectionsPopover";
import { ReelDetailModal } from "../hub/ReelDetailModal";
import { SwipeResearchPlayer, type LikeStatus, type RepostStatus, type FollowStatus } from "./SwipeResearchPlayer";
import { DownloadConnectorButton } from "./DownloadConnectorButton";
import { CommentsPanel } from "./CommentsPanel";
import { ProfilBuehne } from "./ProfilBuehne";
import { panelStil } from "../../lib/panelLook";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Local, page-scoped copy of DashboardPage.tsx's PANEL/PANEL_STYLE —
// byte-identical values, duplicated rather than imported so that frozen
// file stays untouched. The user was explicit: Dashboard's panel IS the
// brand DNA, not a close approximation of it — no gold ring, no extra
// depth tuning, just the same panel.
const PANEL = "rounded-xl border border-[#1a130b]";
const PANEL_STYLE = panelStil();

// Die Kennzahlen zum laufenden Reel, so wie Instagram sie liefert.
// Fehlt ein Wert, steht ein Strich -- nie eine ausgedachte Null.
//
// Die Engagement-Rate rechnet (Likes + Kommentare) / Aufrufe. Das ist die
// uebliche Definition; welche Formel Emres Erweiterung benutzt, ist
// unbekannt, deshalb kann die Zahl dort leicht abweichen. Ohne Aufrufzahl
// -- Instagram laesst sie oft weg -- bleibt sie leer.
function reelKennzahlen(v: ReelVideo | null | undefined) {
  const strich = "—";
  if (!v) return { engagement: strich, likes: strich, comments: strich, reposts: strich, views: strich, laenge: strich, datum: strich, zeit: strich, exaktLikes: undefined, exaktComments: undefined, exaktReposts: undefined, exaktViews: undefined };
  // formatViews haengt immer eine Nachkommastelle an ("10.0K"). Die ist bei
  // einer glatten Zahl nur Rauschen -- Emre am 09.10.2026: "10.0k gibts
  // nicht, lieber 10k". Dieselbe Darstellung steckt auch in anderen
  // Ansichten; dort bewusst nicht angefasst.
  const glatt = (t: string) => t.replace(/\.0(?=[KM]$)/, "");
  const zahl = (n?: number) => (typeof n === "number" ? glatt(formatViews(n)) : strich);
  const views = v.viewsRaw > 0 ? glatt(formatViews(v.viewsRaw)) : strich;
  // Ohne sichtbare Likes gibt es keine vergleichbare Rate -- dann Strich,
  // statt still durch (nur Kommentare / Aufrufe) zu ersetzen.
  const rate =
    !v.likesVerborgen && v.viewsRaw > 0 && (typeof v.likes === "number" || typeof v.comments === "number")
      ? `${((((v.likes ?? 0) + (v.comments ?? 0)) / v.viewsRaw) * 100).toFixed(1)}%`
      : strich;
  const d = typeof v.takenAt === "number" ? new Date(v.takenAt * 1000) : null;
  const exakt = (n?: number) => (typeof n === "number" ? n.toLocaleString() : undefined);
  return {
    exaktLikes: exakt(v.likes),
    exaktComments: exakt(v.comments),
    exaktReposts: exakt(v.reposts),
    exaktViews: v.viewsRaw > 0 ? v.viewsRaw.toLocaleString() : undefined,
    engagement: rate,
    likes: zahl(v.likes),
    comments: zahl(v.comments),
    reposts: zahl(v.reposts),
    views,
    laenge: v.durationSec > 0 ? formatDuration(v.durationSec) : strich,
    datum: d ? d.toLocaleDateString() : strich,
    zeit: d ? d.toLocaleTimeString() : strich,
  };
}

// Dauer im selben Format wie die Uhrzeit darueber: hh:mm:ss, immer
// zweistellig. So stehen "Started" und "Duration" gleich aus und lassen
// sich auf einen Blick vergleichen (Emre, 09.10.2026).
function dauerText(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(s / 3600))}:${zwei(Math.floor((s % 3600) / 60))}:${zwei(s % 60)}`;
}

function SessionRow({ label, value, muted, genau, icon: Icon }: { label: string; value: React.ReactNode; muted?: boolean; genau?: string; icon?: LucideIcon }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {/* Zeichen und Beschriftung stehen zusammen links. Das Zeichen ist
          eine Spur blasser als die Schrift -- es soll die Zeile lesbarer
          machen, nicht um Aufmerksamkeit mit der Zahl rechts streiten.
          shrink-0, damit die Beschriftung beim Umbrechen nicht ins Zeichen
          laeuft. */}
      <span className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={12.5} strokeWidth={1.75} className="shrink-0 text-neutral-600" />}
        <span className="text-[11px] text-neutral-500 truncate">{label}</span>
      </span>
      {/* genau: die ungerundete Zahl beim Darueberfahren -- "250.8K" sagt
          nicht, ob 250.798 oder 250.850 gemeint ist.
          Bewusst NICHT der eingebaute Hinweis des Browsers: der kommt erst
          nach einer Sekunde, sieht aus wie vom Betriebssystem und setzt
          sich irgendwohin. Diese Blase erscheint sofort und sitzt neben der
          Zahl. cursor-default und select-none, damit der Mauszeiger ein
          Zeiger bleibt und nicht zum Textbalken wird. */}
      <span className="relative group flex items-center justify-end">
        <span
          className={[
            "text-[12px] font-medium text-right cursor-default select-none",
            muted ? "text-neutral-600" : "text-neutral-50",
          ].join(" ")}
        >
          {value}
        </span>
        {genau && (
          <span className="pointer-events-none absolute right-full mr-2 hidden group-hover:block whitespace-nowrap rounded-md bg-[#17171a] border border-white/[0.09] px-2 py-1 text-[11px] font-medium text-neutral-100 shadow-lg z-20">
            {genau}
          </span>
        )}
      </span>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
  danger,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spinning?: boolean;
  // Whole-button red treatment for a genuinely destructive/ending action
  // (End Research) — only applied while it's actually clickable, so an
  // inactive End Research still reads as inert, not alarming.
  danger?: boolean;
}) {
  const inactive = disabled || !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactive}
      title={!onClick ? "Not available yet" : undefined}
      className={[
        "press-feedback flex items-center gap-2.5 h-12 px-3.5 rounded-lg border text-[12.5px] transition-colors duration-150",
        inactive
          ? "border-white/[0.06] bg-[#0c0c0e] text-neutral-600 cursor-not-allowed"
          : danger
            ? "border-rose-500/30 bg-rose-500/[0.08] text-rose-200 hover:border-rose-500/50 hover:bg-rose-500/[0.14]"
            : "border-white/[0.07] bg-[#111114] text-neutral-50 hover:border-[#D39448]/35 hover:bg-[#161613]",
      ].join(" ")}
    >
      <Icon
        size={14}
        className={[
          spinning ? "animate-spin" : "",
          inactive ? "text-neutral-600" : danger ? "text-rose-400" : "text-[#D39448]",
        ].join(" ")}
        style={inactive ? undefined : { filter: danger ? "drop-shadow(0 0 2px #f4374780)" : "drop-shadow(0 0 2px #D3944880)" }}
      />
      {label}
    </button>
  );
}

const PLATFORM_LABEL: Record<Platform, string> = { instagram: "IG Research", tiktok: "TikTok Research" };

// Same hover-or-click, click-outside-to-close pattern as
// DownloadConnectorButton's platform choice popover — hover is the primary
// path (a quick "what does this mean" glance), click keeps it open for
// anyone on touch/trackpad-without-hover.
function ResearchInfoPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="About Research training signals"
        className="w-5 h-5 rounded-full flex items-center justify-center text-neutral-600 hover:text-neutral-300 transition-colors duration-150"
      >
        <Info size={14} />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-20 w-[300px] rounded-xl bg-[#141416] border border-white/[0.09] shadow-2xl p-4 animate-fade-in">
          {/* "Current limitation" und "Recommendation" am 09.10.2026
              entfernt. Die Einschraenkung ("Watch-time signals are not
              fully supported") stimmt nicht mehr: Emre hat an seinem
              Research Account nachgewiesen, dass Schauen und Liken den
              Feed drehen -- er hat ihn mit Hochzeitsvideos vollbekommen.
              Und das Vortrainieren auf Instagram braucht es damit auch
              nicht mehr als Empfehlung. */}
          <p className="text-[11px] tracking-[0.08em] uppercase text-[#D39448] font-medium mb-1">What works</p>
          <p className="text-[12.5px] text-neutral-400 leading-relaxed">
            Everything happens on the real account: what gets watched, liked, followed, or blocked is applied
            directly on Instagram and shapes the feed over time.
          </p>
        </div>
      )}
    </div>
  );
}

// Stable display order (whatever the store already returns, i.e. creation
// order) — selecting an account must never reshuffle this chip row.
function accountsFor(accounts: ResearchAccount[], creatorId: string, platform: Platform): ResearchAccount[] {
  return accounts.filter((a) => a.creatorId === creatorId && a.platform === platform);
}

// Separate from display order on purpose: only used to pick a resume point
// when switching Creator/platform, never for the chip row's own ordering.
function mostRecentlyOpened(accounts: ResearchAccount[]): ResearchAccount | null {
  return (
    [...accounts].sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? null
  );
}

// Der Verbindungszustand des Accounts faerbte frueher den Punkt am Chip.
// Seit dem 10.10.2026 zeigt der Punkt stattdessen, ob gerade jemand auf dem
// Account forscht. Ein Account, der Aufmerksamkeit braucht, ist weiterhin
// daran zu erkennen, dass neben ihm der Reconnect-Pfeil erscheint.

// Laeuft auf diesem Account gerade eine Research-Sitzung? Die Sperre liegt
// auf dem Server und wird waehrend einer Sitzung immer wieder verlaengert;
// beim Beenden gibt ReelForge sie frei. Abgelaufen heisst also: niemand ist
// mehr drin.
function istLive(a: ResearchAccount): boolean {
  if (!a.liveLockExpiresAt) return false;
  const bis = new Date(a.liveLockExpiresAt).getTime();
  return Number.isFinite(bis) && bis > Date.now();
}

// Connector Status chip's reachability, derived straight from the same
// LiveSessionStatus the player already uses for its own "Connector needs to
// start" state (see useLiveResearchSession's checkHealth/checkInitialReachability) —
// not a separate signal. "needs_connector" is the only state that means
// Connector genuinely isn't reachable; every other state (idle/connecting/
// updating/active/in_use/error) implies a health check already succeeded at
// some point. Version is intentionally still not shown here — Connector
// doesn't report its own version over /health today.
function connectorReachability(status: LiveSessionStatus): { label: string; dotClass: string; pulseColor?: string } {
  if (status === "needs_connector") return { label: "Not running", dotClass: "bg-rose-500" };
  if (status === "checking") return { label: "Checking…", dotClass: "bg-amber-400 animate-pulse" };
  return { label: "Connected", dotClass: "bg-emerald-400 pulse-live", pulseColor: "rgba(52,211,153,0.55)" };
}

// reelforge-connect:// is registered by the ReelForge Connector desktop app
// (connector-app/) — a small, self-contained helper (bundles its own Node +
// Playwright, no install for the VA beyond the app itself) that opens a
// real, visible Instagram/TikTok login window and waits for the VA to
// actually finish logging in, including whatever verification the platform
// asks for. Nothing in this web app or that link ever sees a password.
function connectDeepLink(platform: Platform, start: ConnectStart): string {
  return `reelforge-connect://connect?platform=${platform}&account=${encodeURIComponent(start.id)}&token=${encodeURIComponent(start.token)}`;
}

// The real "Connect Research Account" flow, in two steps. Step 1 (this
// modal's form) only asks for a label + the account's public username — no
// password, because a stored password could never reliably get through a
// real Instagram/TikTok login on its own (2FA, SMS codes, checkpoints, and
// CAPTCHAs are the norm, not the exception). Submitting the form issues a
// one-time token and hands off to the ReelForge Connector desktop app via a
// reelforge-connect:// link — the actual login happens there, in a real
// browser window, not inside ReelForge. Only once Connector detects a
// genuine session cookie and hands it back does the account go "Active"
// here — this modal just reflects that live status, it never sets it.
function ConnectAccountModal({
  platform,
  mode,
  initialStart,
  initialLabel,
  liveAccount,
  onSubmitNew,
  onClose,
}: {
  platform: Platform;
  mode: "new" | "reconnect";
  initialStart: ConnectStart | null;
  initialLabel?: string;
  liveAccount: ResearchAccount | null;
  onSubmitNew: (label: string, username: string) => Promise<{ start: ConnectStart | null; error: string | null }>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [start, setStart] = useState<ConnectStart | null>(initialStart);
  const [helperNotDetected, setHelperNotDetected] = useState(false);
  const platformName = platform === "instagram" ? "Instagram" : "TikTok";

  function openConnector(nextStart: ConnectStart) {
    setHelperNotDetected(false);
    window.location.href = connectDeepLink(platform, nextStart);
    window.setTimeout(() => {
      if (!document.hidden) setHelperNotDetected(true);
    }, 1400);
  }

  // Hands off to the desktop helper the moment we have a token — for
  // "new", that's right after the form submits; for "reconnect", start is
  // already present when the modal opens.
  useEffect(() => {
    if (start) openConnector(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitting(true);
    setFormError(null);
    const { start: newStart, error: connectError } = await onSubmitNew(label.trim() || username.trim(), username.trim());
    setSubmitting(false);
    if (connectError) setFormError(connectError);
    else if (newStart) {
      setStart(newStart);
      openConnector(newStart);
    }
  }

  const status = liveAccount?.status;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[440px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl p-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-serif text-neutral-50">
              {mode === "reconnect" ? `Reconnect ${initialLabel ?? "this account"}` : `Connect a ${platformName} account`}
            </h2>
            <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
              <X size={16} />
            </button>
          </div>

          {!start ? (
            <form onSubmit={handleSubmit}>
              <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
                You'll log into the real {platformName} account yourself in a moment — this just sets it up.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Label (optional)</label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Lifestyle & Storytime"
                    className="mt-1 w-full h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">{platformName} username</label>
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="@username"
                    className="mt-1 w-full h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                  />
                </div>
              </div>

              {formError && <p className="mt-3 text-[11.5px] text-rose-300/85">{formError}</p>}

              <button
                type="submit"
                disabled={submitting || !username.trim()}
                className="mt-4 w-full h-10 rounded-full bg-[#D39448] text-[#020508] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Setting up…" : "Continue"}
              </button>
            </form>
          ) : status === "active" ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-emerald-400 text-[13px]">
                <Check size={15} />
                Connected — this is now a genuine, authenticated session.
              </div>
              <p className="mt-1.5 text-[11.5px] text-neutral-500 leading-relaxed">
                Its real feed will start appearing under {initialLabel ?? "this account"}.
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full h-10 rounded-full bg-[#D39448] text-[#020508] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-[11.5px] text-neutral-500 leading-relaxed">
                ReelForge Connector should be opening now. A real, visible {platformName} login window will appear there —
                log in as you normally would, including any verification step {platformName} asks for. It closes itself
                the moment you're actually logged in, and this page updates on its own.
              </p>

              <div className="mt-4 flex items-center gap-2 text-[12px] text-amber-300/90">
                <Loader2 size={13} className="animate-spin" />
                Waiting for ReelForge Connector…
              </div>

              {helperNotDetected && (
                <div className="mt-3 rounded-lg surface-field px-3 py-2.5">
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                    Nothing opened? You may not have ReelForge Connector installed yet, or your browser blocked it — ask
                    your ReelForge admin for the installer, or retry below once it's installed.
                  </p>
                  <button
                    onClick={() => start && openConnector(start)}
                    className="mt-2 flex items-center gap-1.5 text-[12px] text-[#D39448] hover:text-[#e3a75f] transition-colors duration-150"
                  >
                    <RotateCw size={11} />
                    Try opening ReelForge Connector again
                  </button>
                </div>
              )}

              {status === "needs_attention" && (
                <p className="mt-3 text-[11.5px] text-amber-300/80">
                  This is taking a while, or a previous attempt didn't finish. You can close this and press Reconnect
                  to get a fresh link.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type Mode = "swipe" | "archive";

// Instagrams Umschalter der Quelle, in unserer Form. "Following" zeigt nur
// noch Reels von Accounts, denen der Research-Account folgt -- das ist ein
// anderer Strom, kein Filter. Ohne laufende Sitzung gibt es drueben keine
// Seite, auf der etwas zu druecken waere: dann ausgegraut.
function QuellenWahl({ sitzung }: { sitzung: { sessionId: string; sessionSecret: string } | null }) {
  const [modus, setModus] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!sitzung) { setModus(null); setOffen(false); return; }
    let weg = false;
    void quelleLesen(sitzung.sessionId, sitzung.sessionSecret)
      .then((a) => { if (!weg && a?.modus) setModus(a.modus); })
      .catch(() => {});
    return () => { weg = true; };
  }, [sitzung]);

  const aus = !sitzung || laeuft;

  async function waehle(ziel: string) {
    setOffen(false);
    if (!sitzung || ziel === modus) return;
    setLaeuft(true);
    setFehler(null);
    const a = await quelleWechseln(sitzung.sessionId, sitzung.sessionSecret, ziel).catch(() => null);
    setLaeuft(false);
    // Erst uebernehmen, wenn der Connector bestaetigt hat -- nicht beim Klick.
    if (a?.ok) setModus(a.modus ?? ziel);
    else setFehler(a?.fehler ?? "Umschalten hat nicht geklappt");
  }

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        disabled={aus}
        onClick={() => setOffen((v) => !v)}
        title={sitzung ? "Switch Instagram's source" : "Only while a research session is running"}
        className={[
          "flex items-center gap-1 h-[22px] px-2 rounded-[7px] border text-[11px] transition-colors duration-150",
          aus
            ? "border-white/[0.06] text-neutral-700 cursor-default"
            : "border-white/[0.09] text-neutral-300 hover:text-neutral-50 hover:border-[#D39448]/35",
        ].join(" ")}
      >
        {laeuft ? "Switching…" : (modus ?? "For you")}
        <span aria-hidden className="text-[9px] leading-none opacity-70">▾</span>
      </button>
      {offen && !aus && (
        <span className="absolute right-0 top-[26px] z-30 w-[118px] rounded-[9px] bg-[#141416] border border-white/[0.09] shadow-2xl p-1">
          {["For you", "Following"].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => void waehle(w)}
              className={[
                "w-full flex items-center justify-between h-7 px-2 rounded-[6px] text-[11.5px] transition-colors duration-150",
                w === modus ? "text-[#D39448]" : "text-neutral-300 hover:text-neutral-50 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {w}
              {w === modus && <span aria-hidden>✓</span>}
            </button>
          ))}
        </span>
      )}
      {fehler && (
        <span className="absolute right-0 top-[26px] z-30 whitespace-nowrap rounded-[7px] bg-[#141416] border border-rose-500/30 px-2 py-1 text-[10.5px] text-rose-300">
          {fehler}
        </span>
      )}
    </span>
  );
}

export function ResearchAccountsPage({
  creators,
  creatorsError,
  collectionsStore,
  researchAccountsStore,
  userId,
  workspaceId,
  active,
  onOpenCollection,
}: {
  creators: Creator[];
  creatorsError?: string | null;
  collectionsStore: CollectionsStore;
  researchAccountsStore: ResearchAccountsStore;
  userId?: string;
  workspaceId?: string;
  // This page now stays mounted (see App.tsx) so the live research session
  // survives navigating to other Client OS sections and back — `active`
  // is only "is this the section actually on screen right now," for
  // gating things that should stop when it isn't (keyboard shortcuts,
  // video playback), not the session's own lifecycle.
  active: boolean;
  // Navigates to the Collections page for a specific collection — used by
  // the Collection button's browse popover (see SavedCollectionsPopover),
  // same navigation App.tsx already wires up for the Hub/Dashboard/etc.
  onOpenCollection: (collectionId: string) => void;
}) {
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(creators[0] ?? null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("swipe");
  // Archive only, from here down — the live session (below) drives Swipe.
  const [rawItems, setRawItems] = useState<ResearchFeedItemRow[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [savePanelVideo, setSavePanelVideo] = useState<ReelVideo | null>(null);
  // Save and Collection are genuinely different actions, not two doors into
  // the same picker: Save opens the familiar quick-save/choose-a-collection
  // panel (SavePanel), Collection opens the same browse-your-collections
  // popover Creativity Hub's own "N saved" pill already uses
  // (SavedCollectionsPopover) — a pure browse/navigate view, not a save
  // target. Reusing that existing component rather than building another.
  const [savedPopoverOpen, setSavedPopoverOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [connectFlow, setConnectFlow] = useState<{ mode: "new" | "reconnect"; start: ConnectStart | null; label?: string } | null>(null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [likeStatus, setLikeStatus] = useState<Record<string, LikeStatus>>({});
  const [repostStatus, setRepostStatus] = useState<Record<string, RepostStatus>>({});
  // Wessen Profil gerade auf der zweiten Buehne offen ist, falls ueberhaupt.
  const [profilName, setProfilName] = useState<string | null>(null);
  // Die drei Panels sollen unten auf einer Linie enden.
  //
  // Die linke Spalte und der Player duerfen so hoch sein, wie ihr Inhalt es
  // verlangt -- sie bestimmen gemeinsam die Linie. NUR die Kommentarspalte
  // bekommt diese Hoehe vorgegeben, denn sie ist die einzige, deren Inhalt
  // beliebig lang werden kann; ohne Vorgabe zog sie waehrend einer Sitzung
  // die ganze Reihe in die Laenge.
  //
  // Mit CSS allein ging das mehrfach schief, deshalb wird hier gemessen
  // statt geraten. Beim Versuch davor hatte ich auch der linken Spalte eine
  // Hoehe aufgezwungen -- die passte nicht zu ihrem Inhalt, und die Hoehen
  // standen von Anfang an schief (10.10.2026 von Emre sofort bemerkt).
  const linksRef = useRef<HTMLDivElement>(null);
  const mitteRef = useRef<HTMLDivElement>(null);
  const [reihenHoehe, setReihenHoehe] = useState<number | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const messen = () => {
      const l = linksRef.current?.getBoundingClientRect().height ?? 0;
      const m = mitteRef.current?.getBoundingClientRect().height ?? 0;
      const h = Math.round(Math.max(l, m));
      if (h > 0) setReihenHoehe((vorher) => (vorher === h ? vorher : h));
    };
    const beobachter = new ResizeObserver(messen);
    if (linksRef.current) beobachter.observe(linksRef.current);
    if (mitteRef.current) beobachter.observe(mitteRef.current);
    messen();
    return () => beobachter.disconnect();
  }, [mode]);
  const [followStatus, setFollowStatus] = useState<Record<string, FollowStatus>>({});
  const [blockStatus, setBlockStatus] = useState<Record<string, "pending" | "done" | "failed">>({});
  // Hat der Mitarbeiter "Refresh Feed" gedrueckt? Nur dann dreht sich dessen
  // Kreis. Vorher haengte das Drehen am Sitzungszustand -- und der ist beim
  // Starten derselbe, also drehte es sich auch dann mit (09.10.2026).
  const [frischtAuf, setFrischtAuf] = useState(false);
  // Beginn und Dauer der laufenden Sitzung. Beides stand bisher auf einem
  // Strich, weil es den Wert nirgends gab -- die Oberflaeche kann ihn aber
  // selbst fuehren: ab dem Moment, in dem die Sitzung steht.
  const [beginn, setBeginn] = useState<number | null>(null);
  const [, tickt] = useState(0);
  const liveSession = useLiveResearchSession(workspaceId);

  useEffect(() => {
    if (!creators.some((c) => c.id === selectedCreator?.id)) setSelectedCreator(creators[0] ?? null);
  }, [creators, selectedCreator]);

  const currentAccounts = useMemo(
    () => (selectedCreator ? accountsFor(researchAccountsStore.accounts, selectedCreator.id, platform) : []),
    [researchAccountsStore.accounts, selectedCreator, platform]
  );
  const currentAccount = currentAccounts.find((a) => a.id === accountId) ?? currentAccounts[0] ?? null;

  // A cancelled-login message belongs to the specific account/context it
  // failed in — moving away from that context (switching platform, picking
  // a different account, a different Creator) should leave it behind, not
  // carry it along as a stale warning about an attempt that has nothing to
  // do with what's now on screen.
  useEffect(() => {
    setReconnectError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreator?.id, platform, currentAccount?.id]);

  // While a connect/reconnect is pending, poll for the real status flip —
  // this app has no other way to learn that the local connector script
  // (running outside the browser) has finished a real login.
  useEffect(() => {
    if (!connectFlow?.start) return;
    const interval = window.setInterval(() => {
      void researchAccountsStore.refetch();
    }, 2500);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectFlow?.start?.id]);

  const connectFlowAccount = connectFlow?.start
    ? researchAccountsStore.accounts.find((a) => a.id === connectFlow.start!.id) ?? null
    : null;

  // A connect/reconnect attempt can die outside this tab entirely — the VA
  // closes the real login window, or it just times out — and
  // connect-worker.mjs reports that back by flipping this row to
  // needs_attention (see cancel-research-account-connect). Waiting for the
  // VA to notice a hint buried in still-open "waiting" copy isn't a real
  // recovery path, so this closes the modal itself the moment that lands —
  // dropping back to the account rail, which already has a real Reconnect
  // action, is the actual clean retry state.
  useEffect(() => {
    if (connectFlowAccount?.status !== "needs_attention") return;
    setConnectFlow(null);
    setReconnectError("Login didn't finish — it may have been closed or timed out. Press Reconnect to try again.");
  }, [connectFlowAccount?.status]);

  // Switching Creator or platform re-picks whichever account was worked on
  // most recently — a real, DB-backed resume point, not device-local memory.
  useEffect(() => {
    setAccountId(mostRecentlyOpened(currentAccounts)?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreator?.id, platform]);

  // Instagrams Bildadressen laufen nach rund vier Tagen ab -- danach bleibt
  // die Kachel im Archiv leer (am 09.10.2026 gemessen). Deshalb holt eine
  // Funktion bei Supabase das Bild und legt eine bleibende Kopie an; die
  // Adresse im Eintrag wird dabei ersetzt.
  //
  // Abgeschickt und NICHT abgewartet: Das Archiv soll dadurch nie langsamer
  // werden. Beim naechsten Oeffnen ist die bleibende Adresse da.
  // Hoechstens zwoelf auf einmal, damit ein grosses Archiv nicht hundert
  // Aufrufe gleichzeitig ausloest -- der Rest kommt beim naechsten Mal.
  const bereitsGesichert = useRef<Set<string>>(new Set());

  // Sichern schon BEIM SEHEN, nicht erst beim Oeffnen des Archivs. Sonst
  // reicht es, vier Tage lang nicht hineinzuschauen -- dann ist Instagrams
  // Adresse abgelaufen und es gibt nichts mehr zu holen. Genau der Fall,
  // den das Ganze verhindern soll.
  //
  // Mit Verzoegerung, weil der Connector den Eintrag erst anlegen muss --
  // vorher faende die Funktion nichts.
  useEffect(() => {
    const reel = liveSession.currentReel;
    if (!reel || bereitsGesichert.current.has(reel.id)) return;
    bereitsGesichert.current.add(reel.id);
    const t = window.setTimeout(() => {
      void supabase.functions.invoke("cache-research-thumbnail", { body: { item_id: reel.id } }).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, [liveSession.currentReel?.id]);

  function sichereThumbnails(rows: ResearchFeedItemRow[]) {
    const offen = rows
      .filter((r) => r.thumbnail_url && !r.thumbnail_url.includes("/client-os-research-thumbnails/"))
      .filter((r) => !bereitsGesichert.current.has(r.id))
      .slice(0, 12);
    for (const r of offen) {
      bereitsGesichert.current.add(r.id);
      void supabase.functions.invoke("cache-research-thumbnail", { body: { item_id: r.id } }).catch(() => {});
    }
  }

  async function loadFeed(accountId: string) {
    setLoadingFeed(true);
    setFeedError(false);
    // seq (a true per-row identity) is the deterministic order — synced_at
    // alone is shared by every reel in the same sync batch and can't fully
    // order or tie-break within it.
    const { data, error } = await supabase
      .schema("client_os")
      .from("research_feed_items")
      .select("*")
      .eq("research_account_id", accountId)
      .order("seq", { ascending: false });
    if (error) {
      setFeedError(true);
      setRawItems([]);
    } else {
      const rows = data as ResearchFeedItemRow[];
      setRawItems(rows);
      sichereThumbnails(rows);
    }
    setLoadingFeed(false);
  }

  useEffect(() => {
    if (!currentAccount) {
      setRawItems([]);
      return;
    }
    void researchAccountsStore.markOpened(currentAccount.id, userId);
    void loadFeed(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  // Archive now fills in live as the VA actually scrolls through the real
  // session (see session-server.mjs's next()), not just from the old
  // connect-time/resync capture — refetching on switching into Archive
  // picks up whatever's landed since this account was last opened, without
  // needing a live subscription for what's still a history/cache view.
  useEffect(() => {
    if (mode === "archive" && currentAccount) void loadFeed(currentAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // The live research session itself never auto-starts just because the
  // selected account/platform changed — switching Instagram <-> TikTok or
  // to a different account always lands on the same neutral "session
  // ended, press Start research" state End research already produces,
  // never a feed that's suddenly playing again on its own. Only an actual
  // click (the "Start research" button, or "Start ReelForge Connector")
  // ever begins a session — see useLiveResearchSession's startSession,
  // which is exactly what onRefreshSession/onRetryWake already call.
  //
  // What this effect still does on every account/platform change: cleanly
  // end whatever session was running before, so switching away always
  // closes the previous live session rather than leaving it running
  // unattended in the background. Navigating to a different Client OS
  // section and back does NOT hit this at all (currentAccount doesn't
  // change), which is what keeps a session already running across that
  // kind of navigation.
  useEffect(() => {
    // Every account/platform switch (not just the very first one) needs to
    // both end whatever session was running on the previous account AND
    // re-verify Connector's real reachability for the newly selected one —
    // endSession() alone always lands on "idle" ("Start research"), which
    // looks identical whether Connector is actually reachable or was quit
    // entirely. Previously this reachability check only ran once ever (see
    // git history), so switching accounts while Connector was down kept
    // showing "Start research" until the separate 5s idle-poll eventually
    // caught up.
    if (!currentAccount) return;
    void (async () => {
      await liveSession.endSession();
      await liveSession.checkInitialReachability(currentAccount.id, currentAccount.platform);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, currentAccount?.status]);

  const videos = useMemo(
    () => rawItems.map((r) => ({ ...researchFeedItemToVideo(r), saved: savedIds.has(r.id) })),
    [rawItems, savedIds]
  );

  const currentSwipeVideo = liveSession.currentReel
    ? { ...liveSession.currentReel, saved: savedIds.has(liveSession.currentReel.id) }
    : null;

  const detailIndex = videos.findIndex((v) => v.id === detailVideoId);
  const detailVideo = detailIndex >= 0 ? videos[detailIndex] : null;

  function markSaved(id: string) {
    setSavedIds((prev) => new Set(prev).add(id));
  }

  function sourceLabelFor(account: ResearchAccount): string {
    return `${PLATFORM_LABEL[account.platform]} — ${account.label}`;
  }

  // A real Like — acts directly on this account's real, currently-open
  // Reels session (see useLiveResearchSession.like / session-server.mjs's
  // Session.like), not a local toggle and not a separate deep-link round
  // trip. Success is only ever reported once Connector has confirmed
  // Instagram's own button genuinely changed state.
  async function handleLikeClick(video: ReelVideo) {
    // Geht der Like direkt in Instagrams Tab, ist das Herz dort ein Schalter
    // -- genau wie auf Instagram. Ein zweiter Druck nimmt ihn zurueck, und
    // genau das muss hier moeglich bleiben: wer sich vertippt, kann es
    // selbst geradebiegen, ohne Instagram zu oeffnen.
    if (likeStatus[video.id] === "pending") return;
    setLikeStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { liked, inTab } = await liveSession.like();
    setLikeStatus((prev) => ({
      ...prev,
      // Nur ausserhalb des Tabs ist "nicht geliked" ein Fehlschlag -- im Tab
      // heisst es schlicht, dass der Like zurueckgenommen wurde.
      [video.id]: liked ? "liked" : inTab ? "offen" : "failed",
    }));
  }

  // Ein echter Repost auf dem verbundenen Konto -- wie bei Instagram ein
  // Schalter: nochmal druecken nimmt ihn zurueck. Erfolg wird erst
  // gemeldet, wenn Instagrams eigener Knopf umgesprungen ist.
  async function handleRepostClick(video: ReelVideo) {
    if (repostStatus[video.id] === "pending") return;
    setRepostStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { reposted, error } = await liveSession.repost();
    setRepostStatus((prev) => ({
      ...prev,
      // Kein Fehler, aber auch nicht repostet, heisst: zurueckgenommen.
      [video.id]: reposted ? "reposted" : error ? "failed" : "offen",
    }));
  }

  // A real platform action on the real connected account (see
  // session-server.mjs's Session.follow) — same shape as handleLikeClick.
  async function handleFollowClick(video: ReelVideo) {
    if (followStatus[video.id] === "pending" || followStatus[video.id] === "following") return;
    setFollowStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { following, error } = await liveSession.follow();
    if (!following) console.error(`[follow] failed for ${video.username || video.id}: ${error ?? "(no error message)"}`);
    setFollowStatus((prev) => ({ ...prev, [video.id]: following ? "following" : "failed" }));
  }

  // A real platform action on the real connected account — the whole point
  // is that Instagram's/TikTok's own recommendation algorithm actually
  // stops surfacing this creator afterward, not a local ReelForge-only
  // blacklist. Only ever reports "done" once Connector has confirmed the
  // real block genuinely took effect (see session-server.mjs's Session.block).
  // Zuruecksetzen, sobald die Sitzung wieder steht. Bewusst hier unten,
  // weil liveSession erst weiter oben im Rumpf entsteht.
  useEffect(() => {
    if (liveSession.status === "active") setFrischtAuf(false);
  }, [liveSession.status]);

  useEffect(() => {
    if (liveSession.status === "active") setBeginn((b) => b ?? Date.now());
    else setBeginn(null);
  }, [liveSession.status]);

  // Startet oder beendet man selbst eine Sitzung, soll der Punkt am Chip
  // sofort umspringen und nicht erst beim naechsten Nachsehen. Fuer die
  // anderen im Workspace erledigt das der regelmaessige Blick in
  // useResearchAccounts.
  useEffect(() => {
    void researchAccountsStore.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSession.status]);

  // Einmal pro Sekunde neu zeichnen, damit die Dauer mitlaeuft. Nur solange
  // eine Sitzung steht -- sonst taeten wir das rund um die Uhr.
  useEffect(() => {
    if (beginn === null) return;
    const t = window.setInterval(() => tickt((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [beginn]);

  async function handleBlockCreator(video: ReelVideo) {
    if (blockStatus[video.id] === "pending" || blockStatus[video.id] === "done") return;
    setBlockStatus((prev) => ({ ...prev, [video.id]: "pending" }));
    const { blocked, error } = await liveSession.block();
    // Diagnostic-only, no behavior change yet -- surfaces the real reason
    // instead of only ever showing "Retry" with no way to tell why.
    if (!blocked) console.error(`[block] failed for ${video.username || video.id}: ${error ?? "(no error message)"}`);
    setBlockStatus((prev) => ({ ...prev, [video.id]: blocked ? "done" : "failed" }));
  }

  if (!selectedCreator) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          {creatorsError ? (
            <p className="text-[14px] text-neutral-300">Couldn't load Creators.</p>
          ) : (
            <>
              <p className="text-[14px] text-neutral-300">Add a Creator to set up Research Accounts.</p>
              <p className="mt-1.5 text-[12px] text-neutral-500">Go to Creators → New Creator.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    // Der Platz fuer die Scrollleiste wird IMMER freigehalten, auch wenn
    // gerade keine da ist. Ohne das wurde die Seite beim Starten einer
    // Sitzung laenger, die Leiste kam dazu, und weil der Inhalt mittig
    // sitzt (mx-auto weiter unten), rutschte alles um ein paar Pixel zur
    // Seite -- beim Beenden wieder zurueck. (Am 10.10.2026 von Emre
    // bemerkt.) Die Spaltenbreiten selbst sind fest, die waren es nicht.
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203", scrollbarGutter: "stable" }}>
      {/* Scoped, stronger than the shared .dashboard-starfield-boost (which
          stays untouched for the frozen Dashboard) — this page gets its
          own bump on top of it, same pattern as Creativity Hub. */}
      <style>{`
        .rf-research-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-research-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>
      {/* Die Seite blendet beim Oeffnen weich auf, statt auf einen Schlag
          dazustehen -- derselbe Auftritt wie auf Billing (11.10.2026). */}
      <Auftritt className="relative max-w-[1400px] xl:max-w-[1650px] 2xl:max-w-[1900px] mx-auto px-10 xl:px-16 2xl:px-24 pt-8 pb-8">
        {/* Confined to the header/hero band only — not the whole scrollable
            page — same as how Dashboard/Creativity Hub scope their
            starfield to just the hero, not every panel below it. */}
        <div className="dashboard-starfield-boost rf-research-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <span className={KOPF_KUERZEL}>Research Accounts</span>
            <h1 className={`${KOPF_TITEL} flex items-center gap-2`}>
              Live research. Real insights.
              <ResearchInfoPopover />
            </h1>
            <p className={`${KOPF_UNTERZEILE} text-neutral-500 max-w-xl`}>
              Monitor creator content, capture winning concepts, and save directly into your Collections.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Der Abstand stand auf 44 Punkt. Dadurch war diese Spalte
                136 Punkt hoch, der Kopftext links nur rund 100 -- und weil
                sich die Kopfzeile nach der hoeheren Seite richtet, klaffte
                unter dem Kopf eine Luecke, die es auf keinem anderen
                Reiter gab (Emre, 11.10.2026). Mit 12 Punkt sind beide
                Seiten gleich hoch. */}
            <DownloadConnectorButton />
            {/* Reachability is real, driven straight off liveSession.status
                (the same signal the player uses for "Connector needs to
                start") — see connectorReachability() above. Version is
                still not shown: Connector doesn't report it over /health
                today, and DownloadConnectorButton deliberately avoids its
                own status indicator (see its comment), so this stays the
                one real reachability readout on the page. */}
            {(() => {
              const reachability = connectorReachability(liveSession.status);
              return (
                <div
                  title={reachability.label}
                  className="flex items-center gap-4 h-[52px] px-4 rounded-xl border border-[#1a130b]"
                  style={PANEL_STYLE}
                >
                  <div className="leading-tight">
                    <p className="text-[12px] text-neutral-400">Connector Status</p>
                    <p className="flex items-center gap-1.5 text-[12.5px] text-neutral-300 mt-0.5">
                      <span
                        className={["w-1.5 h-1.5 rounded-full", reachability.dotClass].join(" ")}
                        style={{ ["--pulse-live-color" as string]: reachability.pulseColor }}
                      />
                      {reachability.label}
                    </p>
                  </div>
                  <Diamond size={14} className="text-neutral-500 shrink-0" />
                </div>
              );
            })()}
          </div>
        </div>

        {/* consolidated toolbar — Creator, platform, and connected-account
            chips in one row, matching the reference. Same account rail as
            before, just no longer a separate row underneath. */}
        <div className={`${PANEL} ${KOPF_ABSTAND} flex items-center gap-3 flex-wrap px-4 py-3`} style={PANEL_STYLE}>
          <CreatorSelector creators={creators} selected={selectedCreator} onSelect={setSelectedCreator} />

          <span className="w-px h-8 bg-white/[0.08] shrink-0" />

          <div className="flex items-center h-11 p-1 rounded-full glass-panel">
            {(["instagram", "tiktok"] as const).map((p) => {
              // Temporarily disabled while TikTok's real-session reliability
              // (login blocks, feed freshness) gets re-verified on a clean
              // account/device/network — see connect-worker.mjs and
              // session-server.mjs, both left fully intact. Instagram is
              // completely unaffected; platform state already defaults to
              // "instagram" and this is the only place it's ever changed,
              // so disabling the click here is enough to fully block access.
              const disabled = p === "tiktok";
              return (
                <button
                  key={p}
                  onClick={() => {
                    if (!disabled) setPlatform(p);
                  }}
                  disabled={disabled}
                  title={disabled ? "TikTok Research is temporarily unavailable" : undefined}
                  className={[
                    "press-feedback flex items-center gap-1.5 h-9 px-4 rounded-full border text-[13px] capitalize transition-colors duration-150",
                    disabled
                      ? "border-transparent text-neutral-700 opacity-50 cursor-not-allowed"
                      : platform === p
                        ? "border-[#141009] text-[#f0c58c]"
                        : "border-transparent text-neutral-500 hover:text-neutral-300",
                  ].join(" ")}
                  style={!disabled && platform === p ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
                >
                  <PlatformIcon platform={p} size={12} />
                  {p === "instagram" ? "Instagram" : "TikTok"}
                  {disabled && (
                    <span className="ml-0.5 text-[9px] tracking-wide uppercase text-neutral-600 font-medium">
                      Beta
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <span className="text-[11.5px] text-neutral-600 ml-1 shrink-0">Connected Accounts</span>
          {currentAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountId(a.id)}
              className={[
                "press-feedback group flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border transition-all duration-150",
                a.id === currentAccount?.id
                  ? "border-[#D39448]/60 bg-[#D39448]/[0.16] text-[#D39448]"
                  : "border-white/[0.08] text-neutral-200 hover:text-neutral-50 hover:border-[#D39448]/35",
              ].join(" ")}
            >
              <PlatformIcon platform={a.platform} size={12} />
              <span className="text-[12.5px]">{a.label}</span>
              {/* Der Punkt sagt EINE Sache: laeuft gerade eine Research-Sitzung
                  auf diesem Account? Gruen heisst "jemand ist gerade drin",
                  rot "frei". Die Auskunft kommt vom Server, deshalb sieht
                  eine Kollegin im anderen Land dasselbe wie du -- und sie
                  erkennt, dass der Account gerade benutzt wird.
                  (Von Emre am 10.10.2026 so festgelegt; vorher stand hier
                  der Verbindungszustand des Accounts.) */}
              {(() => {
                const besetzt = istLive(a);
                return (
                  <span
                    className={["w-2 h-2 rounded-full shrink-0", besetzt ? "bg-emerald-400 pulse-live" : "bg-rose-500"].join(" ")}
                    title={besetzt
                      ? `In use${a.liveLockLabel ? ` by ${a.liveLockLabel}` : ""} right now`
                      : "No research session running"}
                    style={besetzt ? { ["--pulse-live-color" as string]: "rgba(52,211,153,0.55)" } : undefined}
                  />
                );
              })()}
              {(a.status === "needs_attention" || a.status === "disconnected") && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setReconnectError(null);
                    const { start, error } = await researchAccountsStore.reconnectAccount(a.id, a.platform);
                    if (start) setConnectFlow({ mode: "reconnect", start, label: a.label });
                    else setReconnectError(error);
                  }}
                  title="Reconnect"
                  className="text-neutral-500 hover:text-[#D39448] transition-colors duration-150"
                >
                  <RotateCw size={11} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void researchAccountsStore.deleteAccount(a.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-300 transition-opacity duration-150"
              >
                <X size={11} />
              </button>
            </button>
          ))}
          <button
            onClick={() => {
              setReconnectError(null);
              setConnectFlow({ mode: "new", start: null });
            }}
            disabled={currentAccounts.length >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM}
            title={
              currentAccounts.length >= MAX_RESEARCH_ACCOUNTS_PER_PLATFORM
                ? `Up to ${MAX_RESEARCH_ACCOUNTS_PER_PLATFORM} accounts`
                : "Connect a research account"
            }
            className="press-feedback flex items-center gap-1 h-9 px-3 rounded-full border border-dashed border-white/[0.14] text-[12.5px] text-neutral-500 hover:text-neutral-200 hover:border-white/25 transition-colors duration-150 disabled:opacity-30 disabled:cursor-default"
          >
            <Plus size={13} />
            Connect account
          </button>
        </div>
        {reconnectError && <p className="mt-2 text-[11.5px] text-rose-300/85">{reconnectError}</p>}


        {connectFlow && (
          <ConnectAccountModal
            platform={platform}
            mode={connectFlow.mode}
            initialStart={connectFlow.start}
            initialLabel={connectFlow.label}
            liveAccount={connectFlowAccount}
            onClose={() => setConnectFlow(null)}
            onSubmitNew={async (label, username) => {
              const { start, error } = await researchAccountsStore.connectAccount(selectedCreator.id, platform, label, username);
              if (start) {
                setAccountId(start.id);
                setConnectFlow({ mode: "new", start, label });
              }
              return { start, error };
            }}
          />
        )}

        {!currentAccount ? (
          <div className="mt-6 flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
            <Users size={20} className="text-neutral-700 mb-2.5" />
            <p className="text-[14.5px] font-serif text-neutral-300">
              No {platform === "instagram" ? "Instagram" : "TikTok"} research accounts for {selectedCreator.name} yet.
            </p>
            <p className="text-[12px] text-neutral-600 mt-1.5">Connect one above to start researching from its trained feed.</p>
          </div>
        ) : mode === "swipe" ? (
          <div className="relative mt-5 flex gap-7 items-stretch">
            {/* Die zweite Buehne legt sich ueber genau diese drei Panels --
                Seitenleiste und Kopfzeile bleiben stehen (so von Emre am
                10.10.2026 eingezeichnet). Darum sitzt sie hier als Ebene
                ueber der Reihe und nicht ueber der ganzen Seite. */}
            {profilName && (
              <ProfilBuehne
                username={profilName}
                onSchliessen={() => setProfilName(null)}
                oeffnen={liveSession.profilOeffnen}
                strom={liveSession.profilStrom}
                ton={liveSession.profilTon}
                tonAntwort={liveSession.profilTonAntwort}
                bedienen={liveSession.profilBedienen}
                schliessen={liveSession.profilSchliessen}
              />
            )}
            {/* LEFT: Session Context + Quick Actions */}
            {/* Die Reihe wird nicht mehr zentriert: so steht diese Spalte
                buendig unter der Ueberschrift, und der Player bleibt gleich
                daneben. Der uebrige Platz geht komplett an die Luecke vor
                der Kommentarspalte (ml-auto dort). */}
            <div ref={linksRef} className="w-[290px] shrink-0 self-stretch flex flex-col gap-4">
              <div className={PANEL + " p-5"} style={PANEL_STYLE}>
                <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                  Session Context
                </p>
                <div className="space-y-3">
                  <SessionRow
                    label="Account"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        @{currentAccount.username || currentAccount.label}
                        <PlatformIcon platform={currentAccount.platform} size={11} />
                      </span>
                    }
                  />
                  <SessionRow
                    label="Platform"
                    value={currentAccount.platform === "instagram" ? "Instagram Reels" : "TikTok Videos"}
                  />
                  <SessionRow
                    label="Session"
                    value={
                      <span>
                        {currentAccount.label}
                        {liveSession.status === "active" && <span className="text-emerald-400"> - Active</span>}
                      </span>
                    }
                  />
                  {/* No session-start timestamp, elapsed-duration, or scan
                      counter exists anywhere in the live session state today
                      — shown per the reference for layout, left as an honest
                      "—" rather than invented values. */}
                  <SessionRow
                    label="Started"
                    value={beginn ? new Date(beginn).toLocaleTimeString() : "—"}
                    muted={!beginn}
                  />
                  <SessionRow
                    label="Duration"
                    value={beginn ? dauerText(Date.now() - beginn) : "—"}
                    muted={!beginn}
                  />
                </div>

                {/* Zweiter Abschnitt: die Kennzahlen zum Reel, das gerade
                    laeuft. Ersetzt "Items Scanned". Jeder Wert kommt
                    unveraendert aus Instagrams eigener Antwort -- fehlt
                    einer dort, steht hier ein Strich, nie eine erfundene
                    Null. Shares liefert Instagram nicht, deshalb gar nicht
                    erst aufgefuehrt. */}
                <div className="mt-4 pt-4 border-t border-white/[0.07]">
                  <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                    Current Reel
                  </p>
                  {/* Blendet das Konto seine Like-Zahl aus, stehen bei Likes
                      UND Engagement Striche -- die Zeilen selbst bleiben.
                      Sie wegzulassen liess die Panels springen, weil die
                      Spalte kuerzer wurde (10.10.2026 von Emre sofort
                      zurueckgewiesen). Engagement muss mit: die Rate ohne
                      Likes waere eine andere Zahl unter demselben Namen. */}
                  <div className="flex flex-col gap-2.5">
                    <SessionRow icon={Flame} label="Engagement" value={reelKennzahlen(currentSwipeVideo).engagement} muted={!currentSwipeVideo} />
                    <SessionRow icon={Heart} label="Likes" value={reelKennzahlen(currentSwipeVideo).likes} genau={reelKennzahlen(currentSwipeVideo).exaktLikes} muted={!currentSwipeVideo} />
                    <SessionRow icon={Eye} label="Views" value={reelKennzahlen(currentSwipeVideo).views} genau={reelKennzahlen(currentSwipeVideo).exaktViews} muted={!currentSwipeVideo} />
                    <SessionRow icon={MessageCircle} label="Comments" value={reelKennzahlen(currentSwipeVideo).comments} genau={reelKennzahlen(currentSwipeVideo).exaktComments} muted={!currentSwipeVideo} />
                    <SessionRow icon={Repeat2} label="Reposts" value={reelKennzahlen(currentSwipeVideo).reposts} genau={reelKennzahlen(currentSwipeVideo).exaktReposts} muted={!currentSwipeVideo} />
                    <SessionRow icon={Timer} label="Length" value={reelKennzahlen(currentSwipeVideo).laenge} muted={!currentSwipeVideo} />
                    <SessionRow icon={CalendarDays} label="Posted" value={reelKennzahlen(currentSwipeVideo).datum} muted={!currentSwipeVideo} />
                    <SessionRow icon={Clock} label="Time" value={reelKennzahlen(currentSwipeVideo).zeit} muted={!currentSwipeVideo} />
                  </div>
                </div>
              </div>

              {/* Das untere Panel der linken Spalte zieht sich bis zur
                  gleichen Linie wie Player und Kommentare -- sonst endete
                  die linke Spalte frueher und die drei Panels standen
                  unten versetzt (10.10.2026 von Emre bemerkt). */}
              <div className={PANEL + " p-5 flex-1"} style={PANEL_STYLE}>
                <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                  Quick Actions
                </p>
                <div className="flex flex-col gap-2.5">
                  <QuickActionButton
                    icon={RefreshCw}
                    label="Refresh Feed"
                    spinning={frischtAuf && liveSession.status !== "active"}
                    disabled={liveSession.status !== "active"}
                    onClick={() => {
                      // Nicht mehr die ganze Sitzung neu aufbauen: Instagram
                      // wird drueben auf Home geschickt, die Seite neu
                      // geladen und wieder auf Reels gegangen -- der Weg
                      // eines Menschen. Anmeldung, Sitzung und Historie
                      // bleiben dabei bestehen.
                      const sitzung = liveSession.sitzung;
                      if (!sitzung) return;
                      setFrischtAuf(true);
                      void feedAuffrischen(sitzung.sessionId, sitzung.sessionSecret)
                        .catch(() => null)
                        .finally(() => setFrischtAuf(false));
                    }}
                  />
                  <QuickActionButton
                    icon={Square}
                    label="End Research"
                    disabled={liveSession.status !== "active"}
                    onClick={() => void liveSession.endSession()}
                    danger
                  />
                  {/* No "reviewed" state exists on any feed item yet. */}
                  <QuickActionButton icon={CheckCircle2} label="Mark All As Reviewed" />
                  {/* No creator-note storage exists anywhere in the app yet. */}
                  <QuickActionButton icon={StickyNote} label="Add Creator Note" />
                </div>
              </div>
            </div>

            {/* CENTER: the live reel player, now sitting inside its own
                Design-DNA panel (matching Session Context/Intelligence)
                instead of floating as a bare card — the video itself was
                pulled in slightly so it reads as content inside a panel,
                not the panel itself. */}
            {/* ml-2: der Player einen Hauch nach rechts. Die Kommentarspalte
                gibt dieselben 8 px ab (ml-14 -> ml-12), damit die Reihe
                gleich breit bleibt und sich sonst nichts verschiebt. */}
            <div ref={mitteRef} className="w-[382px] shrink-0 self-stretch flex ml-[18px]">
              <div className={PANEL + " p-4 flex-1 flex flex-col items-center"} style={PANEL_STYLE}>
                <div className="w-full max-w-[345px] flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1.5 text-[12px] text-neutral-400">
                    <span className="text-neutral-500">Now Viewing</span>
                    {currentSwipeVideo && (
                      <>
                        <PlatformIcon platform={currentSwipeVideo.platform} size={12} />
                        <span className="text-neutral-50 font-medium">@{currentSwipeVideo.username}</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("archive")}
                    className="text-[11.5px] text-[#D39448] hover:brightness-110 transition-[filter]"
                  >
                    View archive
                  </button>
                </div>
                {/* The logged-in research account itself — already shown in
                    Session Context on the left, repeated here so this panel
                    is self-explanatory on its own too. */}
                <div className="w-full max-w-[345px] flex items-center justify-between gap-2 mb-4 text-[11px] text-neutral-500">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PlatformIcon platform={currentAccount.platform} size={11} />
                    Logged in as <span className="text-neutral-50 font-medium truncate">@{currentAccount.username || currentAccount.label}</span>
                  </span>
                  {/* Instagrams eigener Umschalter der Quelle. Vor dem Start
                      der Research gibt es keine Seite, auf der man ihn
                      druecken koennte -- deshalb bis dahin ausgegraut. */}
                  <QuellenWahl sitzung={liveSession.sitzung} />
                </div>
                <SwipeResearchPlayer
                  sitzung={liveSession.sitzung}
                  onLiveReel={(r) => liveSession.uebernehmeLiveReel(r as never)}
                account={currentAccount}
                currentReel={currentSwipeVideo}
                hasPrev={liveSession.hasPrev}
                loading={liveSession.status === "connecting" || liveSession.status === "checking"}
                navBusy={liveSession.navBusy}
                sessionStatus={liveSession.status}
                sessionError={liveSession.error}
                wakeCountdown={liveSession.wakeCountdown}
                lockedByLabel={liveSession.lockedByLabel}
                onNext={() => void liveSession.next()}
                onPrev={() => void liveSession.prev()}
                onLikeClick={handleLikeClick}
                likeStatus={likeStatus}
                onProfil={(name) => setProfilName(name)}
                onRepostClick={handleRepostClick}
                repostStatus={repostStatus}
                onFollowClick={handleFollowClick}
                followStatus={followStatus}
                onBlockCreator={handleBlockCreator}
                blockStatus={blockStatus}
                onRefreshSession={() => void liveSession.startResearchFromClick(currentAccount.id, currentAccount.platform)}
                onRetryWake={() => {
                  // needs_connector -> the wake path (must run from this
                  // real click); a plain error -> just start over. Both
                  // startResearchFromClick and retryWithWake check for a
                  // pending Connector update before actually starting.
                  if (liveSession.status === "needs_connector") void liveSession.retryWithWake();
                  else void liveSession.startResearchFromClick(currentAccount.id, currentAccount.platform);
                }}
                active={active}
                // Solange die Profil-Buehne offen ist, sollen die Pfeiltasten
                // dort wirken und nicht hier hinten im Reel-Strom.
                tastenAus={!!profilName}
                />
              </div>
            </div>

            {/* RIGHT: Intelligence (Comments/Notes) + Save to Collection —
                one continuous card, matching the reference, instead of two
                separate stacked panels the VA had to scroll past. */}
            {/* Das Pfeil-Panel steht absolut neben dem Video und nimmt
                deshalb selbst keinen Platz in der Reihe ein. Diesen Abstand
                muss die Kommentarspalte lassen, sonst klebt sie daran.
                Gerechnet: 24 px Luft, 60 px Panel, 24 px Luft -- abzueglich
                der 28 px, die die Reihe ohnehin zwischen den Spalten haelt. */}
            <div className="w-[390px] shrink-0 flex min-h-0 ml-auto" style={reihenHoehe ? { height: reihenHoehe } : undefined}>
              <div className={PANEL + " flex-1 flex flex-col min-h-0"} style={PANEL_STYLE}>
                <p className="px-4 pt-4 text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium">
                  Intelligence
                </p>
                {/* Fills whatever extra height this panel picks up from
                    self-stretch matching the center column's height, so the
                    comment list grows/shrinks with it instead of leaving
                    Save to Collection floating at a fixed offset. */}
                <div className="flex-1 flex flex-col min-h-0">
                  <CommentsPanel
                    video={currentSwipeVideo}
                    isOpen
                    fetchComments={liveSession.fetchComments}
                    kommentieren={liveSession.kommentieren}
                    kannKommentieren={liveSession.status === "active"}
                    eigenesKonto={currentAccount.username || currentAccount.label}
                    antwortenLaden={liveSession.antwortenLaden}
                  />
                </div>

                <div className="p-4 border-t border-white/[0.08]">
                  <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium mb-3">
                    Save to Collection
                  </p>
                  <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setSavedPopoverOpen(true)}
                    className="flex items-center justify-center gap-2 h-[52px] rounded-xl border border-white/[0.08] text-[13px] text-neutral-50 hover:border-[#D39448]/35 hover:bg-[#D39448]/[0.05] transition-colors duration-150"
                  >
                    <FolderOpen size={15} className="text-[#D39448]" style={{ filter: "drop-shadow(0 0 2px #D3944880)" }} />
                    Creator's Collections
                  </button>
                  <button
                    type="button"
                    disabled={!currentSwipeVideo || currentSwipeVideo.saved}
                    onClick={() => currentSwipeVideo && !currentSwipeVideo.saved && setSavePanelVideo(currentSwipeVideo)}
                    className="flex items-center justify-center gap-2 h-[52px] rounded-xl text-[#2a1c0e] text-[13px] font-medium hover:brightness-110 transition-[filter] duration-150 disabled:opacity-40 disabled:cursor-default press-feedback"
                    style={{ background: "linear-gradient(90deg, #D39448, #EAC088)", boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)" }}
                  >
                    <Bookmark size={15} fill={currentSwipeVideo?.saved ? "currentColor" : "none"} />
                    {currentSwipeVideo?.saved ? "Saved" : "Quicksave"}
                  </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
        ) : (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                <PlatformIcon platform={currentAccount.platform} size={12} />
                <span className="text-neutral-50 font-medium">{currentAccount.label}</span>
                {currentAccount.username && <span className="text-neutral-600">@{currentAccount.username}</span>}
              </div>

              <div className="flex items-center h-9 p-1 rounded-full glass-panel">
                <button
                  onClick={() => setMode("swipe")}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] transition-all duration-200 text-neutral-500 hover:text-neutral-300"
                >
                  <Play size={11} />
                  Swipe
                </button>
                <button
                  onClick={() => setMode("archive")}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-full border border-[#141009] text-[12px] text-[#f0c58c]"
                  style={{ background: "linear-gradient(90deg, #2a1e11, #1a1510)" }}
                >
                  <LayoutGrid size={11} />
                  Archive
                </button>
              </div>
            </div>

            <div className="mt-5">
              {feedError ? (
                <div className="flex flex-col items-center justify-center text-center rounded-xl surface-panel py-24">
                  <p className="text-[13px] text-neutral-400">Couldn't load this account's archive.</p>
                </div>
              ) : (
                <VideoGrid
                  videos={videos}
                  onSaveClick={(video) => {
                    if (!video.saved) setSavePanelVideo(video);
                  }}
                  onAddToCollection={() => setSavedPopoverOpen(true)}
                  onOpenDetail={(video) => setDetailVideoId(video.id)}
                  spacious
                  showEngagement
                  loading={loadingFeed}
                  loadingLabel="Loading this account's archive…"
                  emptyTitle={
                    currentAccount.status === "connecting"
                      ? "This account is still connecting."
                      : "Nothing archived yet."
                  }
                  emptyHint={
                    currentAccount.status === "connecting"
                      ? "Its real feed will start appearing here once it's ready."
                      : "Reels you've researched will accumulate here over time."
                  }
                />
              )}
            </div>
          </>
        )}
      </Auftritt>

      <SavePanel
        open={!!savePanelVideo}
        video={savePanelVideo}
        creators={creators}
        defaultCreatorId={selectedCreator.id}
        collections={collectionsStore.collections}
        onClose={() => setSavePanelVideo(null)}
        onQuickSave={(note, creatorOverrideId) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          const quickSaves = collectionsStore.collections.find(
            (c) => c.creatorId === targetCreatorId && c.name === "Quick Saves"
          );
          const label = sourceLabelFor(currentAccount);
          if (quickSaves) {
            void collectionsStore.addVideoToCollection(quickSaves.id, savePanelVideo, note, undefined, label);
          } else {
            void collectionsStore.createCollection("Quick Saves", targetCreatorId, "", savePanelVideo, note, undefined, label);
          }
        }}
        onSaveToCollection={(collectionId, note) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          void collectionsStore.addVideoToCollection(collectionId, savePanelVideo, note, undefined, sourceLabelFor(currentAccount));
        }}
        onCreateCollection={(name, note, creatorOverrideId) => {
          if (!savePanelVideo || !currentAccount) return;
          markSaved(savePanelVideo.id);
          const targetCreatorId = creatorOverrideId ?? selectedCreator.id;
          void collectionsStore.createCollection(
            name,
            targetCreatorId,
            "",
            savePanelVideo,
            note,
            undefined,
            sourceLabelFor(currentAccount)
          );
        }}
      />

      <SavedCollectionsPopover
        open={savedPopoverOpen}
        creator={selectedCreator}
        collections={collectionsStore.collections}
        onClose={() => setSavedPopoverOpen(false)}
        onOpenCollection={onOpenCollection}
        onCreateNextVersion={async (collectionId) => {
          const result = await collectionsStore.createNextVersion(collectionId);
          return result.id;
        }}
      />

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideoId}
        creator={selectedCreator}
        onClose={() => setDetailVideoId(null)}
        onSaveClick={(video) => setSavePanelVideo(video)}
        onAddToCollection={() => {
          setSavedPopoverOpen(true);
          setDetailVideoId(null);
        }}
        onPrev={() => {
          if (detailIndex > 0) setDetailVideoId(videos[detailIndex - 1].id);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < videos.length - 1) setDetailVideoId(videos[detailIndex + 1].id);
        }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < videos.length - 1}
      />
    </div>
  );
}
