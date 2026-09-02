import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Clapperboard,
  Clock,
  ExternalLink,
  FolderOpen,
  Radar,
  Users,
} from "lucide-react";
import type { Collection, Creator } from "../../types";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import { formatRelativeTime } from "../../lib/relativeTime";
import { PlatformIcon } from "../hub/PlatformIcon";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Panel surface — deep, warm-black (not neutral/cool-black). Deliberately
// close to the page background so the panel nearly disappears into the
// void; the warmth (R slightly > G > B, instead of equal or blue-leaning
// channels) is what reads as "premium bronze-black" rather than flat
// gray-black.
const PANEL = "rounded-[12px] border border-[#1a130b]";
const PANEL_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, #070707, #020202)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8)",
};

// Nested "card within a panel" surface — Needs Attention rows, Content
// Momentum stat rows, Production Pulse's legend box. A real, deliberate
// step up in value from the panel behind it (not a gradient, not a white
// highlight) — genuinely lighter, and warm-toned like the panel, so these
// read as distinct raised surfaces instead of blending into the panel.
const CARD = "rounded-[10px] border border-[#202024]";
const CARD_STYLE: React.CSSProperties = {
  background: "#111114",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 6px 14px -10px rgba(0,0,0,0.6)",
};
const CARD_HOVER = "hover:border-[#2c2c32]";

// Fixed, hand-placed positions for the hero's very sparse warm-star
// accents — deliberately not randomized like the white starfield, and
// deliberately few, so they read as a couple of deliberate points of
// warmth rather than a colored effect.
const WARM_STARS = [
  { left: 20, top: 18, size: 1.6, duration: 7, delay: 0.5 },
  { left: 68, top: 26, size: 1.4, duration: 8, delay: 2.4 },
  { left: 85, top: 12, size: 1.8, duration: 6.5, delay: 1.1 },
  { left: 40, top: 44, size: 1.3, duration: 7.5, delay: 3.6 },
];

// Local time of the person actually looking at the screen — already
// naturally "session aware" without any extra plumbing.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// The five real stages a Collection can read as, in pipeline order —
// deliberately NOT "Waiting for Creator"/"Needs Review"/"Ready" (those
// aren't real states in the data model; SubmissionStatus is only Sent/
// In Progress/Check Inbox/Cancelled/Finished). "Check Inbox" folds into
// "In Production" here on purpose — it's surfaced as its own, more
// prominent thing in Needs Your Attention instead.
const STAGE_ORDER = ["Saved", "In Review", "In Production", "Delivered", "Cancelled"] as const;
type Stage = (typeof STAGE_ORDER)[number];

// Dot/segment colors — exact Figma reference pipeline-state palette
// (blue/amber/red/green/gray), adapted onto our five real stages.
const STAGE_COLOR: Record<Stage, string> = {
  Saved: "#7c7f85",
  "In Review": "#4a90d9",
  "In Production": "#d8a03c",
  Delivered: "#4fb37a",
  Cancelled: "#c0503f",
};

// Real production stage for a Collection — derived from actual Collection/
// Submission state, never a separate stored field.
function collectionStage(c: Collection): Stage {
  if (c.status === "Completed") return "Delivered";
  if (c.status === "Draft") return "Saved";
  const latest = c.submissions[c.submissions.length - 1];
  if (latest && (latest.status === "In Progress" || latest.status === "Check Inbox")) return "In Production";
  if (latest && latest.status === "Cancelled") return "Cancelled";
  return "In Review";
}

// Figma's Manrope ExtraLight display numerals/headline treatment.
function Num({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={["font-mn font-extralight", className].join(" ")} style={style}>
      {children}
    </span>
  );
}

function PanelHeading({
  title,
  subtitle,
  badge,
  onViewAll,
}: {
  title: string;
  subtitle: string;
  badge?: number;
  onViewAll?: () => void;
}) {
  return (
    <div className="flex items-start justify-between px-[18px] pt-[16px]">
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-center gap-[9px]">
          <h2 className="font-mn text-[10.5px] font-bold tracking-[1.1px] text-[#eee7da]">{title}</h2>
          {typeof badge === "number" && badge > 0 && (
            <span className="rounded-[16px] bg-[#3a2a17] px-[6px] py-[1.5px] text-[8.5px] tracking-[1.1px] text-[#e8b273]">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[9px] text-[#79746b]">{subtitle}</p>
      </div>
      {onViewAll && (
        <button onClick={onViewAll} className="flex shrink-0 items-center gap-[4px] text-[10px] text-[#aaa094] hover:text-[#e8b273] transition-colors duration-150">
          View all <span aria-hidden className="text-[9px]">›</span>
        </button>
      )}
    </div>
  );
}

function FooterLink({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between border-t border-[#1a1a1f] px-[18px] py-[13px] text-[10.5px] text-[#cfc8bc] hover:text-[#e8e1d5] transition-colors duration-150"
    >
      {label} <span aria-hidden className="text-[10.5px] text-[#e8b273]">›</span>
    </button>
  );
}

// One segment of the Operational Pulse strip — a real KPI and a real nav
// shortcut. Gold stays reserved for the three plain counters (matching the
// reference's restrained, muted-khaki icon tint); the two status-carrying
// tiles get real semantic color (danger/success) instead, each with a very
// faint matching glow — subtle, not neon.
const PULSE_TONE: Record<"gold" | "danger" | "success", { color: string; glow: string }> = {
  gold: { color: "#d9a863", glow: "rgba(217,168,99,0.3)" },
  danger: { color: "#e0664f", glow: "rgba(224,102,79,0.3)" },
  success: { color: "#4fb37a", glow: "rgba(79,179,122,0.3)" },
};

function PulseTile({
  icon,
  label,
  value,
  tone = "gold",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "gold" | "danger" | "success";
  onClick?: () => void;
}) {
  const active = tone !== "gold" && value > 0;
  const { color, glow } = PULSE_TONE[tone];
  const iconColor = active ? color : "#d9a863";
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="relative flex flex-1 min-w-[140px] flex-col gap-[6px] px-[22px] py-[17px] text-left disabled:cursor-default"
    >
      <span className="absolute left-0 top-[18px] bottom-[18px] w-px bg-[#1a1a1f]" />
      <div className="flex items-center gap-[10px]">
        <span
          className={active ? "pulse-live rounded-full" : ""}
          style={{
            color: iconColor,
            filter: `drop-shadow(0 0 4px ${active ? glow : PULSE_TONE.gold.glow})`,
            ["--pulse-live-color" as string]: active ? glow.replace("0.3", "0.5") : undefined,
          }}
        >
          {icon}
        </span>
        <span
          className={["text-[23.5px] leading-none font-medium tabular-nums", active ? "" : "text-[#f0eadf]"].join(" ")}
          style={active ? { color } : undefined}
        >
          {value}
        </span>
      </div>
      <p className="text-[10.5px] text-[#aaa49a]">{label}</p>
      <p className="text-[9px] text-[#646058]">—</p>
    </button>
  );
}

// A restrained ring donut, real segments only — built from the exact same
// per-collection stage breakdown the legend already uses.
function StageDonut({ counts, total }: { counts: Record<Stage, number>; total: number }) {
  const size = 132;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = STAGE_ORDER.filter((s) => counts[s] > 0).map((stage) => {
    const fraction = total > 0 ? counts[stage] / total : 0;
    const dash = fraction * circumference;
    const seg = { stage, dash, offset };
    offset += dash;
    return seg;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      {segments.map(({ stage, dash, offset: segOffset }) => (
        <circle
          key={stage}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={STAGE_COLOR[stage]}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-segOffset}
          strokeLinecap="butt"
          style={{ filter: `drop-shadow(0 0 3px ${STAGE_COLOR[stage]}90)` }}
        />
      ))}
    </svg>
  );
}

export function DashboardPage({
  userName,
  creators,
  collections,
  activity,
  onOpenHub,
  onOpenResearch,
  onOpenCollection,
  onOpenCollections,
  onOpenCreators,
  onOpenProduction,
}: {
  userName?: string;
  creators: Creator[];
  collections: Collection[];
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenHub: () => void;
  onOpenResearch: () => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenCollections: () => void;
  onOpenCreators: () => void;
  onOpenProduction: () => void;
}) {
  const allSubmissions = collections.flatMap((c) => c.submissions.map((s) => ({ ...s, collection: c })));
  const activeSubmissions = allSubmissions.filter((s) => s.status !== "Finished" && s.status !== "Cancelled");
  const needsAttention = allSubmissions.filter((s) => s.status === "Check Inbox");
  const finishedCount = allSubmissions.filter((s) => s.status === "Finished").length;
  const savedTotal = collections.reduce((sum, c) => sum + c.concepts.length, 0);
  const activeCollectionsCount = collections.filter((c) => c.status !== "Completed").length;

  const recentCollections = [...collections]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  // Most recently saved individual concepts across all collections, newest
  // first — the "Recently Saved" reel-level column.
  const recentConcepts = [...collections]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .flatMap((c) => c.concepts.map((k) => ({ concept: k, collection: c })))
    .slice(0, 3);

  const creatorById = new Map(creators.map((c) => [c.id, c]));
  const collectionById = new Map(collections.map((c) => [c.id, c]));

  const stageCounts = STAGE_ORDER.reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {} as Record<Stage, number>);
  for (const c of collections) stageCounts[collectionStage(c)] += 1;

  const firstName = userName ? (userName.includes("@") ? userName.split("@")[0] : userName) : "";

  const statusLine =
    needsAttention.length > 0
      ? `${needsAttention.length} item${needsAttention.length === 1 ? "" : "s"} need${needsAttention.length === 1 ? "s" : ""} your input right now.`
      : "Your content engine is running strong.";

  return (
    <div className="h-full overflow-auto" style={{ background: "#020203" }}>
      <div className="mx-auto w-full max-w-[1560px]">
        {/* Hero — same night-sky starfield used across Login/Hub. Background
            is the Figma reference's exact cool dark radial (near-black
            fading to near-black, not a warm/brown wash) — gold only shows
            up as the eyebrow text, the CTA, and a handful of tiny star
            accents, never as a background tint. */}
        <div
          className="relative flex flex-col gap-[6px] overflow-hidden px-[48px] pt-[48px] pb-[46px]"
          style={{
            background:
              "radial-gradient(560px 260px at 88% 4%, rgba(211,148,72,0.05), transparent 70%), #000000",
          }}
        >
          <div className="dashboard-starfield-boost absolute inset-0">
            <StarfieldBackground starCount={300} dustCount={5} />
          </div>
          {/* A couple of tiny warm/gold points among the white starfield —
              deliberately very sparse, so the sky reads as elegant depth
              rather than a colored effect. */}
          {WARM_STARS.map((s, i) => (
            <span
              key={i}
              className="star-twinkle pointer-events-none absolute rounded-full"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                background: "#dcb083",
                boxShadow: "0 0 4px 1px rgba(220,176,131,0.4)",
                animationDuration: `${s.duration}s`,
                animationDelay: `${s.delay}s`,
                ["--star-peak" as string]: 0.65,
              } as React.CSSProperties}
            />
          ))}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
          />
          <p className="relative text-[10.5px] tracking-[1.8px] text-[#c08e4e]">REELFORGE COMMAND CENTER</p>
          <h1 className="relative font-mn font-light text-[42px] tracking-[-0.8px] text-[#f2ece1]">
            {greeting()}
            {firstName && <>, {firstName}</>}.
          </h1>
          <p className="relative text-[14px] text-[#b1aba0]">{statusLine}</p>
          <div className="relative flex items-center gap-[8px] pt-[6px]">
            <span
              className="pulse-live h-[6px] w-[6px] shrink-0 rounded-[3px]"
              style={{
                background: needsAttention.length > 0 ? "#e0664f" : "#4ec27a",
                boxShadow: needsAttention.length > 0 ? "0 0 6px #e0664f" : "0 0 6px #4ec27a",
                ["--pulse-live-color" as string]: needsAttention.length > 0 ? "rgba(224,102,79,0.5)" : "rgba(78,194,122,0.5)",
              }}
            />
            <span className="text-[11px] text-[#c3bdb2]">
              {needsAttention.length > 0 ? "Action needed" : "All systems operational"}
            </span>
          </div>

          <div className="absolute right-[48px] top-[90px] z-10 flex w-[196px] flex-col gap-[13px]">
            <button
              onClick={onOpenResearch}
              className="flex h-[44px] w-full items-center justify-center gap-[9px] rounded-[10px] text-[12px] font-medium text-[#2a1c0e] press-feedback"
              style={{
                background: "linear-gradient(90deg, #D39448, #EAC088)",
                boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)",
              }}
            >
              <Radar size={14} />
              Start Research
            </button>
            <button
              onClick={onOpenProduction}
              className="flex h-[44px] w-full items-center justify-center gap-[9px] rounded-[10px] border border-[#1e1e22] bg-[#0f0f12] text-[12px] text-[#ece5d9] hover:bg-[#141417] hover:border-[#26262a] transition-colors duration-150 press-feedback"
            >
              <Clapperboard size={13} />
              Open Production
            </button>
          </div>
        </div>

        <div className="px-[48px] pb-[48px]">
          {/* Operational Pulse */}
          <div className={["flex items-center px-[4px]", PANEL].join(" ")} style={PANEL_STYLE}>
            <div className="flex w-[212px] shrink-0 flex-col gap-[8px] px-[22px] py-[17px]">
              <div className="flex items-center gap-[7px]">
                <Activity size={13} className="text-[#e8b273]" />
                <p className="text-[9.5px] font-bold tracking-[1.4px] text-[#e8b273]">OPERATIONAL PULSE</p>
              </div>
              <p className="text-[9.5px] leading-snug text-[#79746b]">Live overview of your workspace</p>
            </div>
            <PulseTile icon={<Users size={18} />} label="Active Creators" value={creators.length} onClick={onOpenCreators} />
            <PulseTile icon={<FolderOpen size={18} />} label="Saved Concepts" value={savedTotal} onClick={onOpenCollections} />
            <PulseTile icon={<Clapperboard size={18} />} label="In Production" value={activeSubmissions.length} onClick={onOpenProduction} />
            <PulseTile icon={<AlertTriangle size={18} />} label="Needs Attention" value={needsAttention.length} tone="danger" onClick={onOpenProduction} />
            <PulseTile icon={<CheckCircle2 size={18} />} label="Delivered" value={finishedCount} tone="success" onClick={onOpenProduction} />
          </div>

          {/* Row 2 — Needs Your Attention / Content Momentum / Production Pulse */}
          <div className="mt-[22px] flex items-stretch gap-[20px]">
            <div className={["flex flex-1 min-w-0 flex-col", PANEL].join(" ")} style={PANEL_STYLE}>
              <PanelHeading title="NEEDS YOUR ATTENTION" subtitle="Items that need your action" badge={needsAttention.length} onViewAll={onOpenProduction} />
              <div className="flex flex-col gap-[8px] px-[18px] pt-[14px]">
                {needsAttention.length === 0 ? (
                  <p className="py-[10px] text-[10.5px] text-[#878278]">Everything is moving smoothly. Nothing needs your input right now.</p>
                ) : (
                  needsAttention.slice(0, 3).map((s) => {
                    const creator = creatorById.get(s.collection.creatorId);
                    return (
                      <button
                        key={s.id}
                        onClick={() => onOpenCollection(s.collection.id)}
                        className={["hover-lift flex items-center gap-[11px] p-[8px] text-left", CARD, CARD_HOVER].join(" ")}
                        style={CARD_STYLE}
                      >
                        <div
                          className="h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[7px] ring-1 ring-white/10"
                          style={creator?.profileImage ? {} : { background: creator?.avatarColor ?? "#3d362f" }}
                        >
                          {creator?.profileImage && <img src={creator.profileImage} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-medium text-[#eae4d9]">{s.collection.name}</p>
                          <div className="mt-[5px] flex items-center gap-[7px]">
                            <p className="truncate text-[9.5px] text-[#878278]">Submission #{s.index}</p>
                            <span
                              className="shrink-0 rounded-[4px] border border-[#5a2c26] px-[6px] py-[2px] text-[8px] tracking-[0.5px] text-[#e88a70]"
                              style={{ background: "linear-gradient(180deg, #3a211d, #2b1a1a)", boxShadow: "0 0 6px rgba(224,102,79,0.15)" }}
                            >
                              CHECK INBOX
                            </span>
                          </div>
                        </div>
                        <p className="shrink-0 text-[9.5px] text-[#79746b]">{formatRelativeTime(s.collection.updatedAt)}</p>
                        <span className="shrink-0 rounded-[7px] border border-[#242429] bg-[#111114] px-[12px] py-[7px] text-[10.5px] text-[#f0eadf]">
                          Review
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="px-[18px] pb-[15px] pt-[10px] text-[10.5px] text-[#878278]">Everything is prioritized. Keep it moving. 🚀</p>
            </div>

            <div className={["flex flex-1 min-w-0 flex-col justify-between", PANEL].join(" ")} style={PANEL_STYLE}>
              <div>
                <PanelHeading title="CONTENT MOMENTUM" subtitle="Your ideas. Saved. Organized." />
                <div className="flex gap-[16px] px-[18px] pb-[16px] pt-[13px]">
                  <div className="flex flex-1 min-w-[130px] flex-col gap-[8px]">
                    <button onClick={onOpenCollections} className="hover-lift flex items-center gap-[10px] rounded-[8px] border border-[#202024] px-[10px] py-[8px] text-left hover:border-[#2c2c32]" style={CARD_STYLE}>
                      <span className="relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: "radial-gradient(circle at 50% 40%, #d9a86326, #d9a86308 70%, transparent 100%)", boxShadow: "inset 0 0 0 1px #d9a86322" }}>
                        <FolderOpen size={13} className="text-[#d9a863]" style={{ filter: "drop-shadow(0 0 2px #d9a86380)" }} />
                      </span>
                      <span className="flex-1 min-w-0 truncate whitespace-nowrap text-[11px] font-medium text-[#d9a863]">Saved Concepts</span>
                      <span className="text-[10.5px] text-[#aaa49a]">{savedTotal}</span>
                    </button>
                    <button onClick={onOpenCollections} className="hover-lift flex items-center gap-[10px] rounded-[8px] border border-[#202024] px-[10px] py-[8px] text-left hover:border-[#2c2c32]" style={CARD_STYLE}>
                      <span className="relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: "radial-gradient(circle at 50% 40%, #4a90d926, #4a90d908 70%, transparent 100%)", boxShadow: "inset 0 0 0 1px #4a90d922" }}>
                        <Clapperboard size={13} className="text-[#6ba3d9]" style={{ filter: "drop-shadow(0 0 2px #6ba3d980)" }} />
                      </span>
                      <span className="flex-1 min-w-0 truncate whitespace-nowrap text-[11px] font-medium text-[#d9a863]">Active Collections</span>
                      <span className="text-[10.5px] text-[#aaa49a]">{activeCollectionsCount}</span>
                    </button>
                    <button onClick={onOpenProduction} className="hover-lift flex items-center gap-[10px] rounded-[8px] border border-[#202024] px-[10px] py-[8px] text-left hover:border-[#2c2c32]" style={CARD_STYLE}>
                      <span
                        className="relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px]"
                        style={{
                          background: needsAttention.length > 0 ? "radial-gradient(circle at 50% 40%, #e0664f26, #e0664f08 70%, transparent 100%)" : "radial-gradient(circle at 50% 40%, #d9a86326, #d9a86308 70%, transparent 100%)",
                          boxShadow: needsAttention.length > 0 ? "inset 0 0 0 1px #e0664f22" : "inset 0 0 0 1px #d9a86322",
                        }}
                      >
                        <AlertTriangle
                          size={13}
                          className={needsAttention.length > 0 ? "text-[#e0664f]" : "text-[#d9a863]"}
                          style={{ filter: needsAttention.length > 0 ? "drop-shadow(0 0 2px #e0664f80)" : "drop-shadow(0 0 2px #d9a86380)" }}
                        />
                      </span>
                      <span className="flex-1 min-w-0 truncate whitespace-nowrap text-[11px] font-medium text-[#d9a863]">Needs Attention</span>
                      <span className="text-[10.5px] text-[#aaa49a]">{needsAttention.length}</span>
                    </button>
                    <button onClick={onOpenHub} className="hover-lift flex items-center gap-[10px] rounded-[8px] border border-[#202024] px-[10px] py-[8px] text-left hover:border-[#2c2c32]" style={CARD_STYLE}>
                      <span className="relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: "radial-gradient(circle at 50% 40%, #4fb37a26, #4fb37a08 70%, transparent 100%)", boxShadow: "inset 0 0 0 1px #4fb37a22" }}>
                        <Radar size={13} className="text-[#6bc797]" style={{ filter: "drop-shadow(0 0 2px #6bc79780)" }} />
                      </span>
                      <span className="flex-1 min-w-0 truncate whitespace-nowrap text-[11px] font-medium text-[#d9a863]">Creativity Hub</span>
                      <span className="text-[10.5px] text-[#aaa49a] opacity-70">↗</span>
                    </button>
                  </div>
                  <div className="w-[164px] max-w-[42%] shrink">
                    <p className="text-[8.5px] tracking-[1.2px] text-[#878278]">RECENTLY SAVED</p>
                    <div className="mt-[11px] flex flex-col">
                      {recentConcepts.length === 0 ? (
                        <p className="pt-[8px] text-[9.5px] text-[#79746b]">Nothing saved yet.</p>
                      ) : (
                        recentConcepts.map(({ concept, collection }) => (
                          <button
                            key={concept.video.id}
                            onClick={() => onOpenCollection(collection.id)}
                            className="flex items-center gap-[8px] border-t border-[#17171b] py-[8px] text-left"
                          >
                            <div
                              className="h-[40px] w-[33px] shrink-0 overflow-hidden rounded-[5px] bg-cover bg-center"
                              style={
                                concept.video.thumbnailUrl
                                  ? { backgroundImage: `url(${concept.video.thumbnailUrl})` }
                                  : { background: concept.video.thumbGradient ?? "linear-gradient(135deg,#1a1a1d,#0f0f11)" }
                              }
                            />
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[9.5px] leading-snug text-[#f0eadf]">{collection.name}</p>
                              <p className="mt-[6px] text-[9px] text-[#79746b]">{formatRelativeTime(collection.updatedAt)}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <FooterLink label="Go to Creativity Hub" onClick={onOpenHub} />
            </div>

            <div className={["flex flex-1 min-w-0 flex-col", PANEL].join(" ")} style={PANEL_STYLE}>
              <PanelHeading title="PRODUCTION PULSE" subtitle="Real-time status of your pipeline" />
              <div className="flex flex-1 items-center gap-[14px] px-[18px]">
                  <div className="relative flex h-[132px] w-[132px] shrink-0 items-center justify-center">
                    <div
                      className="pointer-events-none absolute inset-[-14px] rounded-full"
                      style={{ background: "radial-gradient(circle, rgba(74,144,217,0.08), rgba(216,160,60,0.05) 55%, transparent 75%)" }}
                    />
                    <StageDonut counts={stageCounts} total={collections.length} />
                    <div className="absolute flex flex-col items-center gap-[2px]">
                      <Num className="text-[21.5px] leading-none text-[#f0eadf]">{stageCounts["In Production"]}</Num>
                      <p className="text-[9.5px] text-[#948d82]">In Production</p>
                    </div>
                  </div>
                  <div className="flex flex-1 min-w-[104px] flex-col gap-[10px]">
                    {STAGE_ORDER.map((stage) => (
                      <div key={stage} className="flex items-center gap-[10px]">
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ background: STAGE_COLOR[stage], boxShadow: `0 0 4px ${STAGE_COLOR[stage]}80` }}
                        />
                        <span className="flex-1 truncate text-[11.5px] font-medium text-[#f0eadf]">{stage}</span>
                        <span className="text-[11.5px] text-[#aaa49a]">{stageCounts[stage]}</span>
                      </div>
                    ))}
                  </div>
              </div>
              <FooterLink label="Open Production" onClick={onOpenProduction} />
            </div>
          </div>

          {/* Row 3 — Recent Concepts / Recent Activity */}
          <div className="mt-[20px] flex items-stretch gap-[20px]">
            <div className={["flex flex-[1.5] min-w-0 flex-col", PANEL].join(" ")} style={PANEL_STYLE}>
              <PanelHeading title="RECENT CONCEPTS" subtitle="Latest concepts from your workspace" onViewAll={onOpenCollections} />
              {recentCollections.length === 0 ? (
                <p className="px-[18px] pb-[16px] pt-[13px] text-[10.5px] text-[#878278]">Save your first concept from the Creativity Hub.</p>
              ) : (
                <div className="flex gap-[16px] px-[18px] pb-[16px] pt-[13px]">
                  {recentCollections.map((c) => {
                    const preview = c.concepts[0];
                    return (
                      <button
                        key={c.id}
                        onClick={() => onOpenCollection(c.id)}
                        className="hover-lift group relative h-[172px] flex-1 overflow-hidden rounded-[10px] text-left ring-1 ring-white/[0.07] hover:ring-white/[0.14]"
                      >
                        {preview?.video.thumbnailUrl ? (
                          <img src={preview.video.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0" style={{ background: preview?.video.thumbGradient ?? "linear-gradient(135deg,#1a1a1d,#0f0f11)" }} />
                        )}
                        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75))" }} />
                        <div className="absolute left-[9px] top-[9px] flex h-[20px] w-[20px] items-center justify-center rounded-[6px] bg-black/70 border border-white/10">
                          <PlatformIcon platform={preview?.video.platform ?? "instagram"} size={11} />
                        </div>
                        <div className="absolute right-[9px] top-[9px] flex h-[20px] w-[20px] items-center justify-center rounded-[6px] bg-black/70 border border-white/10 text-white/90 group-hover:text-[#e8b273] transition-colors duration-150">
                          <Bookmark size={11} />
                        </div>
                        <div className="absolute bottom-[11px] left-[11px] flex flex-col gap-[5px]">
                          <p className="text-[11px] font-medium text-white">{c.name}</p>
                          <p className="text-[9.5px] text-[#c6c0b6]">{formatRelativeTime(c.updatedAt)}</p>
                        </div>
                        <div className="absolute bottom-[12px] right-[11px] text-white/85">
                          <ExternalLink size={13} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={["flex flex-1 min-w-0 flex-col", PANEL].join(" ")} style={PANEL_STYLE}>
              <PanelHeading title="RECENT ACTIVITY" subtitle="What's happening in your workspace" onViewAll={onOpenCollections} />
              <div className="mt-[10px] flex flex-col">
                {activity.loading && <p className="px-[18px] py-[10px] text-[10.5px] text-[#79746b]">Loading…</p>}
                {!activity.loading && activity.items.length === 0 && (
                  <p className="px-[18px] py-[10px] text-[10.5px] text-[#79746b]">Nothing yet — activity shows up here as you go.</p>
                )}
                {activity.items.slice(0, 5).map((item) => {
                  const relatedCollection = item.collectionId ? collectionById.get(item.collectionId) : undefined;
                  const relatedCreator = relatedCollection ? creatorById.get(relatedCollection.creatorId) : undefined;
                  return (
                  <button
                    key={item.id}
                    onClick={() => item.collectionId && onOpenCollection(item.collectionId)}
                    disabled={!item.collectionId}
                    className="group flex items-center gap-[11px] border-t border-[#17171b] px-[18px] py-[9.5px] text-left first:border-t-0 disabled:cursor-default"
                  >
                    {relatedCreator?.profileImage ? (
                      <span className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-full border border-[#202024]">
                        <img src={relatedCreator.profileImage} alt="" className="h-full w-full object-cover" />
                      </span>
                    ) : relatedCreator ? (
                      <span
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#202024] text-[9.5px] font-medium text-[#e8e1d5]"
                        style={{ background: relatedCreator.avatarColor ?? "#3d362f" }}
                      >
                        {relatedCreator.name?.slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      <span
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#202024] text-[#948d82]"
                        style={{ background: "radial-gradient(circle at 50% 40%, #d9a86314, #11111400 70%), #111114" }}
                      >
                        <Clock size={11} />
                      </span>
                    )}
                    <p className={["flex-1 truncate text-[11px] font-medium text-[#eae4d9]", item.collectionId && "group-hover:text-[#e8b273] transition-colors duration-150"].join(" ")}>
                      {item.message}
                    </p>
                    <span className="shrink-0 text-[9.5px] text-[#79746b]">{item.relativeTime}</span>
                  </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
