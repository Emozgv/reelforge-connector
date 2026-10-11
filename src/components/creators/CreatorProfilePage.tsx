import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Clapperboard,
  Compass,
  CreditCard,
  FolderHeart,
  History,
  ImagePlus,
  ListChecks,
  NotebookPen,
  PanelsTopLeft,
  Plus,
  ScanFace,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { Collection, Creator, CreatorPackage, Language, Setting, SubmissionStatus } from "../../types";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import { CONTENT_STYLES } from "../../data/mockData";
import { creatorSetupStatus } from "../../lib/creatorMapping";
import { computeCreatorUsageStats } from "../../lib/creatorUsageStats";
import { planBadgeLabel, planBadgeStyle, planPriceLabel } from "../../lib/planDisplay";
import { DriveGlyph } from "../collections/DriveGlyph";
import { NewCollectionPanel } from "../collections/NewCollectionPanel";
import { computeCreatorStats } from "./creatorStats";
import { TraitsInput } from "./TraitsInput";
import { panelStil, PANEL_RAND } from "../../lib/panelLook";

const TALKING_OPTIONS: Creator["preferredTalking"][] = ["Talking", "Non-Talking", "Any"];
const SETTING_OPTIONS: (Setting | "Any")[] = ["Indoor", "Outdoor", "Any"];
const LANGUAGE_OPTIONS: (Language | "Any")[] = ["Any", "English", "Spanish", "German", "Non-verbal"];

// Die Sektionsflaeche kommt aus lib/panelLook.ts -- derselbe Schalter wie der
// Rest der App. Sonst bliebe genau diese Seite auf Design V2 stehen, waehrend
// alle anderen auf V1 zurueckgehen, und der Vergleich waere wertlos.
const HEADER_BG = "linear-gradient(103.9deg, #080909 40%, #050607 72%, #161614 100%)";
const GOLD = "#D39448";
const GOLD_GRADIENT = "linear-gradient(113.7deg, #EAC088 0%, #D39448 100%)";
const GHOST_GRADIENT = "linear-gradient(138.8deg, rgb(32,34,38) 0%, rgb(17,19,22) 100%)";
const FIELD_GRADIENT = "linear-gradient(135deg, rgb(18,21,24) 0%, rgb(22,24,27) 100%)";
const DEFAULT_THUMB = "linear-gradient(135deg, #1b1e22 0%, #0d0f12 100%)";

const SETUP_STATUS_LABEL: Record<ReturnType<typeof creatorSetupStatus>, string> = {
  draft: "Setup: Draft",
  in_progress: "Setup: In progress",
  ready: "Setup: Ready",
};

type TabKey = "overview" | "collections" | "submissions" | "identity" | "direction" | "notes";

// Die Symbole folgen, wo es sie gibt, der Sprache der Hauptnavigation:
// Collections ist dort FolderHeart, Produktion Clapperboard, der kreative
// Bereich Sparkles. Der Rest ist nach Bedeutung gewaehlt, nicht nach
// Verfuegbarkeit -- ScanFace fuer das Gesicht, an dem Production sich
// orientiert, Compass fuer die Richtung, Send fuer das, was rausgeht.
const TABS: { key: TabKey; label: string; icon: typeof PanelsTopLeft }[] = [
  { key: "overview", label: "Overview", icon: PanelsTopLeft },
  { key: "collections", label: "Collections", icon: FolderHeart },
  { key: "submissions", label: "Submissions", icon: Send },
  { key: "identity", label: "Identity", icon: ScanFace },
  { key: "direction", label: "Direction", icon: Compass },
  { key: "notes", label: "Notes", icon: NotebookPen },
];

// Only three visual states exist in the design: finished (green), cancelled
// (red) and everything still in flight (neutral). "Check Inbox" borrows the
// header badge's amber, since it's the one state that needs the client to act.
const SUBMISSION_BADGE: Record<SubmissionStatus, { bg: string; fg: string }> = {
  Finished: { bg: "#102d25", fg: "#7bcca7" },
  Cancelled: { bg: "#381719", fg: "#fd6b62" },
  "Check Inbox": { bg: "#291e08", fg: "#ffc443" },
  Sent: { bg: "#1b2129", fg: "#b2b9c4" },
  "In Progress": { bg: "#1b2129", fg: "#b2b9c4" },
};

// The activity trail is free text (activity_events.message), so the row icon is
// picked from what the event is about rather than from a stored type.
function activityIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("submission")) return Send;
  if (l.includes("concept")) return Clapperboard;
  if (l.includes("note")) return NotebookPen;
  return FolderHeart;
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={["rounded-[12px] border", className].join(" ")} style={panelStil()}>
      {children}
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: typeof PanelsTopLeft; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <Icon size={16} className="text-neutral-400" />
      <h2 className="text-[14px] font-semibold text-[#f1f1f3] leading-[19px]">{children}</h2>
    </div>
  );
}

function GhostButton({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ backgroundImage: GHOST_GRADIENT }}
      className="h-[27px] px-[10px] rounded-[7px] border border-[#27292d] text-[11px] text-[#f1f1f3] hover:border-[#3a3d42] transition-colors duration-150 press-feedback"
    >
      {children}
    </button>
  );
}

function GoldButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundImage: GOLD_GRADIENT,
        boxShadow: "inset 0 0 5px 0 rgba(255,208,131,0.33)",
      }}
      className="h-[27px] px-[9px] rounded-[7px] border border-[#e8a743] flex items-center gap-[6px] text-[11px] font-medium text-[#080704] press-feedback"
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={
        active
          ? {
              backgroundImage: "linear-gradient(135deg, rgb(53,39,22) 0%, rgb(36,28,18) 100%)",
              boxShadow: "inset 0 0 6px 0 rgba(216,148,41,0.13)",
            }
          : undefined
      }
      className={[
        "h-[28px] px-[10px] rounded-[8px] border text-[11px] transition-colors duration-150",
        active
          ? "border-[#cf8d25] text-[#ffc34c]"
          : "border-[#2c3037] bg-[#0c0f12] text-[#c4ccd8] hover:border-[#3b4049]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] tracking-[0.25px] uppercase text-[#cbd2de]">{children}</label>
  );
}

function NotesField({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ backgroundImage: FIELD_GRADIENT }}
      className="mt-[7px] w-full resize-none rounded-[7px] border border-[#33363b] p-[9px] text-[12px] leading-relaxed text-neutral-200 placeholder:text-[#8f8779] outline-none focus-glow"
    />
  );
}

// One checklist tile from the Setup card — 39px tall, badge left, label right.
function ChecklistTile({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="h-[39px] px-[11px] rounded-[6px] border border-[#272a2f] flex items-center gap-[9px]">
      <span
        className="w-[19px] h-[19px] rounded-[6px] flex items-center justify-center shrink-0"
        style={{
          backgroundImage: done
            ? "linear-gradient(135deg, rgb(41,157,121) 0%, rgb(21,85,63) 100%)"
            : "linear-gradient(135deg, rgb(44,46,50) 0%, rgb(35,38,42) 100%)",
        }}
      >
        {done ? (
          <Check size={12} strokeWidth={3} className="text-white" />
        ) : (
          <span className="w-[4px] h-[4px] rounded-full bg-[#7c8089]" />
        )}
      </span>
      <span className={["text-[11px] truncate", done ? "text-[#e8eaee]" : "text-[#9aa0aa]"].join(" ")}>
        {label}
      </span>
    </div>
  );
}

function StatCell({
  value,
  label,
  divider,
}: {
  value: number | string;
  label: string;
  divider: boolean;
}) {
  return (
    <div
      className={[
        "flex-1 px-[12px] flex flex-col justify-center",
        divider ? "border-r border-[rgba(32,33,36,0.33)]" : "",
      ].join(" ")}
    >
      <span className="text-[16px] font-bold text-[#f1f1f3] tabular-nums leading-[19px]">{value}</span>
      <span className="mt-[6px] text-[11px] text-[#b1b2b9] leading-[13px]">{label}</span>
    </div>
  );
}

function CollectionTile({
  collection,
  onOpen,
}: {
  collection: Collection;
  onOpen: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const cover = collection.concepts[0]?.video;
  const count = collection.concepts.length;
  return (
    <button
      onClick={onOpen}
      style={{ backgroundImage: "linear-gradient(135deg, rgb(16,23,27) 0%, rgb(17,20,22) 100%)" }}
      className="group text-left rounded-[6px] border border-[#2a2d31] overflow-hidden hover:border-[#D39448]/35 transition-colors duration-150"
    >
      <div className="h-[88px] w-full bg-black/30 overflow-hidden">
        {cover?.thumbnailUrl && !thumbFailed ? (
          <img
            src={cover.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full" style={{ background: cover?.thumbGradient ?? DEFAULT_THUMB }} />
        )}
      </div>
      <div className="px-[8px] pt-[6px] pb-[7px]">
        <p className="text-[11px] text-[#f1f1f3] truncate leading-[13px]">{collection.name}</p>
        <p className="mt-[5px] text-[11px] text-[#a3aab4] leading-[13px]">
          {count} {count === 1 ? "concept" : "concepts"}
        </p>
      </div>
    </button>
  );
}

type FeedSubmission = {
  id: string;
  index: number;
  conceptCount: number;
  sentAt: string;
  status: SubmissionStatus;
  deliveryUrl?: string;
  collectionName: string;
};

function SubmissionsTable({ rows }: { rows: FeedSubmission[] }) {
  return (
    <div className="rounded-[8px] border border-[#20252a] overflow-hidden">
      <div className="h-[30px] px-[12px] flex items-center bg-[rgba(19,24,30,0.53)] border-b border-[#1c2228] text-[10px] text-[#aeb5c0]">
        <span className="w-[69px] shrink-0">#</span>
        <span className="w-[296px] shrink-0">Name</span>
        <span className="w-[124px] shrink-0">Concepts</span>
        <span className="w-[149px] shrink-0">Date</span>
        <span className="w-[102px] shrink-0">Source</span>
        <span className="w-[115px] shrink-0">Status</span>
      </div>
      {rows.length === 0 && (
        <p className="px-[12px] py-[14px] text-[11px] text-[#8b919b]">No submissions yet.</p>
      )}
      {rows.map((s, i) => {
        const badge = SUBMISSION_BADGE[s.status];
        return (
          <div
            key={s.id}
            className={[
              "h-[34px] px-[12px] flex items-center",
              i === rows.length - 1 ? "" : "border-b border-[#1c2228]",
            ].join(" ")}
          >
            <span className="w-[69px] shrink-0 text-[11px] text-[#f1f1f3] tabular-nums">#{s.index}</span>
            <span className="w-[296px] shrink-0 pr-3 text-[11px] text-[#f1f1f3] truncate">
              {s.collectionName} · Submission #{s.index}
            </span>
            <span className="w-[124px] shrink-0 text-[11px] text-[#f1f1f3] tabular-nums">
              {s.conceptCount}
            </span>
            <span className="w-[149px] shrink-0 text-[11px] text-[#b1b6c0] tabular-nums">{s.sentAt}</span>
            <span className="w-[102px] shrink-0">
              {s.status === "Finished" && s.deliveryUrl ? (
                <a
                  href={s.deliveryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[7px] text-[11px] text-[#f1f1f3] hover:text-[#D39448] transition-colors duration-150"
                >
                  <DriveGlyph size={12} />
                  Drive
                </a>
              ) : (
                <span className="text-[11px] text-[#a1a5ae]">—</span>
              )}
            </span>
            <span className="w-[115px] shrink-0">
              <span
                className="inline-block px-[8px] py-[4px] rounded-[5px] text-[11px] leading-none"
                style={{ background: badge.bg, color: badge.fg }}
              >
                {s.status}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CreatorProfilePage({
  creator,
  collections,
  creatorsStore,
  plan,
  onOpenBilling,
  onBack,
  backLabel,
  onOpenCollection,
  onCreateCollection,
}: {
  creator: Creator;
  collections: Collection[];
  creatorsStore: CreatorsStore;
  plan: CreatorPackage | undefined;
  onOpenBilling: () => void;
  onBack: () => void;
  // Wohin der Weg zurueck fuehrt, in Worten. Kam man aus den Collections,
  // steht hier "All collections" statt "All creators" -- sonst verspricht
  // der Knopf etwas anderes, als er tut.
  backLabel?: string;
  onOpenCollection: (collectionId: string) => void;
  onCreateCollection: (name: string, creatorId: string, note: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [subFilter, setSubFilter] = useState<"all" | "active" | "Finished" | "Cancelled">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const stats = computeCreatorStats(creator.id, collections);
  const setupStatus = creatorSetupStatus(creator);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    await creatorsStore.uploadProfileImage(creator.id, file);
    setUploadingPhoto(false);
  }

  async function handleReferenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingReference(true);
    await creatorsStore.uploadReferencePhoto(creator.id, file);
    setUploadingReference(false);
  }

  // "Quick Saves" (the creator's automatic default collection) always leads
  // the list — everything else keeps its existing order.
  const ownCollections = useMemo(
    () =>
      collections
        .filter((c) => c.creatorId === creator.id)
        .sort((a, b) => Number(b.name === "Quick Saves") - Number(a.name === "Quick Saves")),
    [collections, creator.id]
  );

  const allSubmissions = useMemo<FeedSubmission[]>(
    () =>
      ownCollections
        .flatMap((c) =>
          c.submissions.map((s) => ({
            id: s.id,
            index: s.index,
            conceptCount: s.conceptIds.length,
            sentAt: s.sentAt,
            status: s.status,
            deliveryUrl: s.deliveryUrl,
            collectionName: c.name,
          }))
        )
        // sentAt is a display string, so this is the same ordering the previous
        // version used — not a true chronological sort.
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [ownCollections]
  );

  const submissionCounts = {
    all: allSubmissions.length,
    active: allSubmissions.filter((s) => s.status !== "Finished" && s.status !== "Cancelled").length,
    Finished: allSubmissions.filter((s) => s.status === "Finished").length,
    Cancelled: allSubmissions.filter((s) => s.status === "Cancelled").length,
  };

  const filteredSubmissions = allSubmissions.filter((s) => {
    if (subFilter === "all") return true;
    if (subFilter === "active") return s.status !== "Finished" && s.status !== "Cancelled";
    return s.status === subFilter;
  });

  // Real activity, taken from the Collections' own append-only activity_events
  // trail (newest last in the store, so reversed here). No separate per-creator
  // feed exists, so nothing is invented.
  const activity = useMemo(
    () =>
      ownCollections
        .flatMap((c) => c.history.map((h, i) => ({ ...h, collectionName: c.name, order: i })))
        .reverse(),
    [ownCollections]
  );

  const checklist = [
    { done: !!creator.profileImage, label: "Profile photo" },
    { done: creator.referencePhotos.length >= 3, label: "3+ reference photos" },
    {
      done: creator.bodyNotes.trim() !== "" || creator.identityNotes.trim() !== "",
      label: "Body / identity notes",
    },
    {
      done:
        creator.contentDos.trim() !== "" ||
        creator.contentDonts.trim() !== "" ||
        creator.creativeDirection.trim() !== "",
      label: "Content direction",
    },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  const initials = creator.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function togglePreferredStyle(style: (typeof CONTENT_STYLES)[number]) {
    const has = creator.preferredStyles.includes(style);
    creatorsStore.updatePreferredStyles(
      creator.id,
      has ? creator.preferredStyles.filter((s) => s !== style) : [...creator.preferredStyles, style]
    );
  }

  const visibleTraits = creator.traits.slice(0, 5);
  const hiddenTraits = creator.traits.length - visibleTraits.length;
  const headerPhotos = creator.referencePhotos.slice(0, 4);
  const hiddenPhotos = creator.referencePhotos.length - headerPhotos.length;

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-[1320px] mx-auto px-[25px] pt-[11px] pb-[46px]">
        {/* Top bar */}
        <div className="h-[26px] flex items-center">
          <button
            onClick={onBack}
            className="flex items-center gap-[8px] text-[12px] text-neutral-400 hover:text-neutral-100 transition-colors duration-150"
          >
            <ArrowLeft size={16} />
            {backLabel ?? "All creators"}
          </button>
        </div>

        <div className="mt-[9px] grid grid-cols-[minmax(0,1fr)_288px] gap-[22px] items-start">
          {/* ---------- Main column ---------- */}
          <div className="min-w-0">
            {/* Creator header card */}
            <div
              className="relative h-[187px] rounded-[12px] border overflow-hidden flex"
              style={{ backgroundImage: HEADER_BG, borderColor: PANEL_RAND }}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Change profile photo"
                className="group relative w-[251px] h-full shrink-0 flex items-center justify-center text-[22px] font-medium text-[#020508]"
                style={creator.profileImage ? undefined : { background: creator.avatarColor }}
              >
                {creator.profileImage ? (
                  <img
                    src={creator.profileImage}
                    alt={creator.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
                {/* fade from the photo into the card body */}
                <span
                  className="absolute inset-y-0 right-0 w-[29px] pointer-events-none"
                  style={{ backgroundImage: "linear-gradient(90deg, rgba(5,6,7,0) 0%, #050607 100%)" }}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {uploadingPhoto ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Camera size={18} className="text-white" />
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <div className="flex-1 min-w-0 pt-[12px] pr-[12px] pl-[12px] flex gap-[12px]">
                <div className="w-[381px] min-w-0">
                  <div className="flex items-center gap-[6px]">
                    <h1
                      className="font-serif font-bold text-[32px] text-[#f1f1f3] leading-[37px] tracking-[-0.6px] truncate"
                      title={creator.name}
                    >
                      {creator.name}
                    </h1>
                    <span className="shrink-0 px-[8px] py-[5px] rounded-[5px] bg-[#291e08] text-[10px] text-[#ffc443] leading-none">
                      {SETUP_STATUS_LABEL[setupStatus]}
                    </span>
                  </div>
                  <p className="mt-[3px] text-[14px] text-[#e3e3e6] truncate">{creator.handle}</p>
                  <p className="mt-[11px] text-[11px] leading-[16px] text-[#9aa0aa] line-clamp-2">
                    {creator.creativeDirection.trim() ||
                      "No creative direction written yet — add one under Direction."}
                  </p>
                  <div className="mt-[11px] flex items-center gap-[7px] flex-nowrap overflow-hidden">
                    {visibleTraits.map((t) => (
                      <span
                        key={t}
                        className="h-[25px] px-[11px] shrink-0 rounded-[12px] border border-[#292c31] text-[10px] text-[#d6d9df] inline-flex items-center whitespace-nowrap"
                        style={{
                          backgroundImage: "linear-gradient(135deg, #171a1d 0%, #101216 100%)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    {hiddenTraits > 0 && (
                      <span className="h-[23px] px-[10px] shrink-0 rounded-[12px] border border-[#292c31] text-[10px] text-[#9aa0aa] inline-flex items-center">
                        +{hiddenTraits}
                      </span>
                    )}
                    {creator.traits.length === 0 && (
                      <span className="text-[10px] text-[#6f747d]">No traits yet</span>
                    )}
                  </div>
                </div>

                <div className="ml-auto w-[299px] shrink-0 pt-[42px]">
                  <div className="h-[58px] rounded-[9px] border border-[rgba(26,27,29,0.4)] bg-[#0b0e11]/60 flex">
                    <StatCell value={stats.collectionsCount} label="Collections" divider />
                    <StatCell value={stats.totalConcepts} label="Concepts" divider />
                    <StatCell value={stats.used} label="Used" divider />
                    <StatCell value={stats.unused} label="Unused" divider={false} />
                  </div>
                  <div className="mt-[9px] flex gap-[6px]">
                    {headerPhotos.map((url) => (
                      <button
                        key={url}
                        onClick={() => setTab("identity")}
                        title="Reference photos"
                        className="w-[55px] h-[56px] rounded-[7px] border border-[#414038] overflow-hidden"
                      >
                        <img src={url} alt="Reference" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {hiddenPhotos > 0 && (
                      <button
                        onClick={() => setTab("identity")}
                        className="w-[55px] h-[56px] rounded-[7px] border border-[#414038] bg-[#33291e] text-[11px] text-[#e6dac4]"
                      >
                        +{hiddenPhotos}
                      </button>
                    )}
                    {creator.referencePhotos.length < 4 && (
                      <button
                        onClick={() => setTab("identity")}
                        title="Add reference photos"
                        className="w-[55px] h-[56px] rounded-[7px] border border-dashed border-[#414038] flex items-center justify-center text-[#8f8779] hover:text-[#e6dac4] transition-colors duration-150"
                      >
                        <ImagePlus size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section nav */}
            <div className="h-[44px] border-b border-[#23252a] flex items-stretch">
              {TABS.map(({ key, label, icon: Icon }) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={[
                      "px-[26px] flex items-center gap-[8px] text-[11px] -mb-px border-b-2 transition-colors duration-150",
                      active
                        ? "border-[#D39448] text-[#D39448]"
                        : "border-transparent text-[#c4c7d0] hover:text-neutral-100",
                    ].join(" ")}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ---------- Overview ---------- */}
            {tab === "overview" && (
              <div className="mt-[13px] space-y-[14px]">
                <div className="grid grid-cols-[minmax(0,576fr)_minmax(0,364fr)] gap-[14px] items-start">
                  {/* Setup checklist */}
                  <div
                    className="rounded-[12px] border border-[#46331a] pt-[18px] pb-[18px] px-[18px]"
                    style={{ ...panelStil(), borderColor: "#46331a" }}
                  >
                    <div className="flex items-center gap-1">
                      <ListChecks size={16} style={{ color: GOLD }} />
                      <h2 className="text-[14px] font-semibold text-[#f1f1f3] leading-[19px]">
                        Setup checklist
                      </h2>
                    </div>
                    <p className="mt-[9px] text-[11px] text-[#9aa0aa] leading-[13px]">
                      Complete these steps to get the best results for this creator.
                    </p>
                    <div className="mt-[16px] h-[7px] rounded-[6px] bg-[#25272a] overflow-hidden">
                      <div
                        className="h-full rounded-[6px]"
                        style={{
                          width: `${(checklistDone / checklist.length) * 100}%`,
                          backgroundImage: "linear-gradient(90deg, #EAC088 0%, #D39448 100%)",
                        }}
                      />
                    </div>
                    <div className="mt-[14px] grid grid-cols-2 gap-x-[11px] gap-y-[8px]">
                      {checklist.map((c) => (
                        <ChecklistTile key={c.label} done={c.done} label={c.label} />
                      ))}
                    </div>
                  </div>

                  {/* Recent activity */}
                  <Section className="pt-[14px] pb-[14px] px-[14px]">
                    <div className="px-[2px] flex items-center justify-between h-[24px]">
                      <div className="flex items-center gap-1">
                        <History size={16} className="text-neutral-400" />
                        <h2 className="text-[14px] font-semibold text-[#f1f1f3] leading-[19px]">
                          Recent activity
                        </h2>
                      </div>
                      <GhostButton onClick={() => setTab("collections")}>View all</GhostButton>
                    </div>
                    <div className="mt-[10px]">
                      {activity.length === 0 && (
                        <p className="py-[12px] text-[11px] text-[#8b919b]">No activity yet.</p>
                      )}
                      {activity.slice(0, 4).map((a, i) => (
                        <div
                          key={`${a.label}-${a.date}-${i}`}
                          className={[
                            "h-[44px] flex items-center gap-[12px]",
                            i === Math.min(activity.length, 4) - 1 ? "" : "border-b border-[#1c2025]",
                          ].join(" ")}
                        >
                          <span className="w-[33px] h-[33px] shrink-0 rounded-full border border-[#272a2f] bg-[#14171a] flex items-center justify-center text-neutral-400">
                            {(() => {
                              const Icon = activityIcon(a.label);
                              return <Icon size={15} />;
                            })()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] text-[#e8eaee] truncate leading-[15px]">
                              {a.label}
                            </p>
                            <p className="text-[11px] text-[#8b919b] leading-[15px]">{a.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>

                {/* Collections */}
                <Section className="pt-[13px] pb-[16px] px-[16px]">
                  <div className="h-[27px] flex items-center justify-between">
                    <SectionHeading icon={FolderHeart}>Collections</SectionHeading>
                    <div className="flex items-center gap-[12px]">
                      <GhostButton onClick={() => setTab("collections")}>View all</GhostButton>
                      <GoldButton onClick={() => setCreateOpen(true)}>
                        <Plus size={13} />
                        New Collection
                      </GoldButton>
                    </div>
                  </div>
                  <div className="mt-[10px]">
                    {ownCollections.length === 0 ? (
                      <p className="py-[12px] text-[11px] text-[#8b919b]">No collections yet.</p>
                    ) : (
                      <div className="grid grid-cols-6 gap-[14px]">
                        {ownCollections.slice(0, 6).map((c) => (
                          <CollectionTile
                            key={c.id}
                            collection={c}
                            onOpen={() => onOpenCollection(c.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Section>

                {/* Submissions */}
                <Section className="pt-[13px] pb-[14px] px-[15px]">
                  <div className="h-[26px] flex items-center gap-[19px]">
                    <SectionHeading icon={Send}>Submissions</SectionHeading>
                    <div className="flex items-center gap-[7px]">
                      {(
                        [
                          ["all", "All"],
                          ["active", "In Progress"],
                          ["Finished", "Finished"],
                          ["Cancelled", "Cancelled"],
                        ] as const
                      ).map(([key, label]) => {
                        const active = subFilter === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setSubFilter(key)}
                            className={[
                              "h-[27px] px-[9px] rounded-[6px] border flex items-center gap-[5px] text-[11px] transition-colors duration-150",
                              active
                                ? "bg-[#191d21] border-[#505156] text-[#e6dac4]"
                                : "bg-[#0c1013] border-[#1a1e22] text-[#b2b9c4] hover:border-[#2a2f35]",
                            ].join(" ")}
                          >
                            {label}
                            <span
                              className={[
                                "px-[5px] py-px rounded-[8px] text-[10px] leading-[12px] tabular-nums",
                                active ? "bg-[#D39448] text-[#140c00]" : "bg-[#29313c] text-[#b2b9c4]",
                              ].join(" ")}
                            >
                              {submissionCounts[key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="ml-auto">
                      <GhostButton onClick={() => setTab("submissions")}>View all</GhostButton>
                    </div>
                  </div>
                  <div className="mt-[10px]">
                    <SubmissionsTable rows={filteredSubmissions.slice(0, 5)} />
                  </div>
                </Section>
              </div>
            )}

            {/* ---------- Collections tab ---------- */}
            {tab === "collections" && (
              <div className="mt-[13px]">
                <Section className="pt-[13px] pb-[16px] px-[16px]">
                  <div className="h-[27px] flex items-center justify-between">
                    <SectionHeading icon={FolderHeart}>
                      Collections
                      <span className="ml-[6px] text-[11px] font-normal text-[#a3aab4]">
                        {ownCollections.length}
                      </span>
                    </SectionHeading>
                    <GoldButton onClick={() => setCreateOpen(true)}>
                      <Plus size={13} />
                      New Collection
                    </GoldButton>
                  </div>
                  <div className="mt-[10px]">
                    {ownCollections.length === 0 ? (
                      <p className="py-[12px] text-[11px] text-[#8b919b]">No collections yet.</p>
                    ) : (
                      <div className="grid grid-cols-6 gap-[14px]">
                        {ownCollections.map((c) => (
                          <CollectionTile
                            key={c.id}
                            collection={c}
                            onOpen={() => onOpenCollection(c.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Section>
              </div>
            )}

            {/* ---------- Submissions tab ---------- */}
            {tab === "submissions" && (
              <div className="mt-[13px]">
                <Section className="pt-[13px] pb-[14px] px-[15px]">
                  <div className="h-[26px] flex items-center gap-[19px]">
                    <SectionHeading icon={Send}>Submissions</SectionHeading>
                    <div className="flex items-center gap-[7px]">
                      {(
                        [
                          ["all", "All"],
                          ["active", "In Progress"],
                          ["Finished", "Finished"],
                          ["Cancelled", "Cancelled"],
                        ] as const
                      ).map(([key, label]) => {
                        const active = subFilter === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setSubFilter(key)}
                            className={[
                              "h-[27px] px-[9px] rounded-[6px] border flex items-center gap-[5px] text-[11px] transition-colors duration-150",
                              active
                                ? "bg-[#191d21] border-[#505156] text-[#e6dac4]"
                                : "bg-[#0c1013] border-[#1a1e22] text-[#b2b9c4] hover:border-[#2a2f35]",
                            ].join(" ")}
                          >
                            {label}
                            <span
                              className={[
                                "px-[5px] py-px rounded-[8px] text-[10px] leading-[12px] tabular-nums",
                                active ? "bg-[#D39448] text-[#140c00]" : "bg-[#29313c] text-[#b2b9c4]",
                              ].join(" ")}
                            >
                              {submissionCounts[key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-[10px]">
                    <SubmissionsTable rows={filteredSubmissions} />
                  </div>
                </Section>
              </div>
            )}

            {/* ---------- Identity tab ---------- */}
            {tab === "identity" && (
              <div className="mt-[13px] space-y-[14px]">
                <Section className="pt-[14px] pb-[16px] px-[16px]">
                  <SectionHeading icon={ScanFace}>Character &amp; identity</SectionHeading>
                  <p className="mt-[9px] text-[11px] leading-[16px] text-[#9aa0aa]">
                    Reference photos and body/identity notes Production uses to keep this Creator
                    consistent.
                  </p>

                  <div className="mt-[16px]">
                    <FieldLabel>Reference photos ({creator.referencePhotos.length}/5)</FieldLabel>
                    <div className="mt-[7px] flex gap-[6px] flex-wrap">
                      {creator.referencePhotos.map((url) => (
                        <div
                          key={url}
                          className="group relative w-[88px] h-[90px] rounded-[7px] border border-[#414038] overflow-hidden"
                        >
                          <img src={url} alt="Reference" className="w-full h-full object-cover" />
                          <button
                            onClick={() => creatorsStore.removeReferencePhoto(creator.id, url)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      {creator.referencePhotos.length < 5 && (
                        <button
                          onClick={() => referenceInputRef.current?.click()}
                          className="w-[88px] h-[90px] rounded-[7px] border border-dashed border-[#414038] flex items-center justify-center text-[#8f8779] hover:text-[#e6dac4] transition-colors duration-150"
                        >
                          {uploadingReference ? (
                            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          ) : (
                            <ImagePlus size={16} />
                          )}
                        </button>
                      )}
                    </div>
                    <input
                      ref={referenceInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleReferenceChange}
                    />
                  </div>

                  <div className="mt-[16px] grid grid-cols-2 gap-[14px]">
                    <div>
                      <FieldLabel>Body notes</FieldLabel>
                      <NotesField
                        value={creator.bodyNotes}
                        onChange={(v) => creatorsStore.updateField(creator.id, "bodyNotes", v)}
                        placeholder="Proportions, build..."
                      />
                    </div>
                    <div>
                      <FieldLabel>Tattoo notes</FieldLabel>
                      <NotesField
                        value={creator.tattooNotes}
                        onChange={(v) => creatorsStore.updateField(creator.id, "tattooNotes", v)}
                        placeholder="Location, size, none..."
                      />
                    </div>
                  </div>

                  <div className="mt-[14px]">
                    <FieldLabel>Hair / face / identity notes</FieldLabel>
                    <NotesField
                      value={creator.identityNotes}
                      onChange={(v) => creatorsStore.updateField(creator.id, "identityNotes", v)}
                      placeholder="Hair color/length, distinguishing features..."
                    />
                  </div>
                </Section>
              </div>
            )}

            {/* ---------- Direction tab ---------- */}
            {tab === "direction" && (
              <div className="mt-[13px] space-y-[14px]">
                <Section className="pt-[14px] pb-[16px] px-[16px]">
                  <SectionHeading icon={Compass}>Direction</SectionHeading>
                  <div className="mt-[16px] grid grid-cols-2 gap-[14px]">
                    <div>
                      <FieldLabel>Content do's</FieldLabel>
                      <NotesField
                        value={creator.contentDos}
                        onChange={(v) => creatorsStore.updateField(creator.id, "contentDos", v)}
                        placeholder="What always works..."
                      />
                    </div>
                    <div>
                      <FieldLabel>Content don'ts</FieldLabel>
                      <NotesField
                        value={creator.contentDonts}
                        onChange={(v) => creatorsStore.updateField(creator.id, "contentDonts", v)}
                        placeholder="What to avoid..."
                      />
                    </div>
                  </div>
                  <div className="mt-[14px] grid grid-cols-2 gap-[14px]">
                    <div>
                      <FieldLabel>Preferred outfits</FieldLabel>
                      <NotesField
                        value={creator.preferredOutfits}
                        onChange={(v) => creatorsStore.updateField(creator.id, "preferredOutfits", v)}
                        placeholder="Typical wardrobe..."
                        rows={2}
                      />
                    </div>
                    <div>
                      <FieldLabel>Settings</FieldLabel>
                      <NotesField
                        value={creator.settingNotes}
                        onChange={(v) => creatorsStore.updateField(creator.id, "settingNotes", v)}
                        placeholder="Typical settings beyond indoor/outdoor..."
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="mt-[14px]">
                    <FieldLabel>Brand direction</FieldLabel>
                    <NotesField
                      value={creator.brandDirection}
                      onChange={(v) => creatorsStore.updateField(creator.id, "brandDirection", v)}
                      placeholder="Overall tone and positioning for this Creator..."
                    />
                  </div>
                </Section>
              </div>
            )}

            {/* ---------- Notes tab ---------- */}
            {tab === "notes" && (
              <div className="mt-[13px] space-y-[14px]">
                <Section className="pt-[14px] pb-[16px] px-[16px]">
                  <SectionHeading icon={NotebookPen}>Notes</SectionHeading>
                  <NotesField
                    value={creator.clientNotes}
                    onChange={(v) => creatorsStore.updateField(creator.id, "clientNotes", v)}
                    placeholder="Internal notes..."
                    rows={5}
                  />
                </Section>
                <Section className="pt-[14px] pb-[16px] px-[16px]">
                  <SectionHeading icon={NotebookPen}>Notes from ReelForge</SectionHeading>
                  <p className="mt-[10px] text-[11px] leading-[16px] text-[#8b919b]">
                    Nothing from the ReelForge team yet — this fills in once Internal can write back
                    to this Creator's profile.
                  </p>
                </Section>
              </div>
            )}
          </div>

          {/* ---------- Sidebar ---------- */}
          <div className="space-y-[11px]">
            <Section className="pt-[14px] pb-[16px] px-[15px]">
              <div className="flex items-center justify-between h-[18px]">
                <div className="flex items-center gap-[6px]">
                  <CreditCard size={14} style={{ color: GOLD }} />
                  <h2 className="text-[13px] font-semibold text-[#f1f1f3]">Plan</h2>
                </div>
                <button
                  onClick={onOpenBilling}
                  className="text-[11px] text-[#9aa0aa] hover:text-[#D39448] transition-colors duration-150"
                >
                  Billing
                </button>
              </div>

              <span
                className={[
                  "mt-[12px] inline-block text-[11px] font-medium px-2 py-[3px] rounded-full",
                  planBadgeStyle(plan),
                ].join(" ")}
              >
                {planBadgeLabel(plan)}
              </span>

              {plan ? (
                (() => {
                  const usage = computeCreatorUsageStats(plan, collections);
                  const pct =
                    plan.planTier === "Enterprise"
                      ? 0
                      : Math.min(100, (usage.reelsUsed / usage.reelsTotal) * 100);
                  return (
                    <div className="mt-[12px]">
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="text-neutral-300">
                          {plan.planTier === "Enterprise" ? (
                            "Pooled Enterprise allowance"
                          ) : (
                            <>
                              <span className="text-[#f1f1f3] font-medium tabular-nums">
                                {usage.reelsUsed}
                              </span>
                              <span className="text-[#8b919b]"> / {usage.reelsTotal} reels</span>
                            </>
                          )}
                        </span>
                        <span className="text-[#8b919b]">{planPriceLabel(plan)}</span>
                      </div>
                      {plan.planTier !== "Enterprise" && (
                        <div className="mt-[9px] h-[7px] rounded-[6px] bg-[#25272a] overflow-hidden">
                          <div
                            className="h-full rounded-[6px]"
                            style={{
                              width: `${pct}%`,
                              backgroundImage: "linear-gradient(90deg, #EAC088 0%, #D39448 100%)",
                            }}
                          />
                        </div>
                      )}
                      <p className="mt-[11px] text-[10px] text-[#7a7f88] leading-[12px]">
                        Cycle started{" "}
                        {new Date(plan.billingCycleStart).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}
                        {usage.paidRegenerationsUsed > 0 &&
                          ` · ${usage.paidRegenerationsUsed} paid regeneration${
                            usage.paidRegenerationsUsed === 1 ? "" : "s"
                          } used`}
                      </p>
                    </div>
                  );
                })()
              ) : (
                <p className="mt-[10px] text-[11px] text-[#8b919b] leading-[16px]">
                  This creator has no active ReelForge plan. Reels can't be produced for them until
                  one is set up.
                </p>
              )}
            </Section>

            <Section className="pt-[10px] pb-[18px] px-[15px]">
              <div className="flex items-center gap-[6px] h-[23px]">
                <Sparkles size={14} style={{ color: GOLD }} />
                <h2 className="text-[13px] font-semibold text-[#f1f1f3]">Creative Profile</h2>
              </div>
              <p className="mt-[5px] text-[11px] leading-[15px] text-[#9aa0aa]">
                Tell ReelForge what fits this Creator. Used to improve future concept matching and
                recommendations.
              </p>

              {creatorsStore.saveError && (
                <p className="mt-2 text-[11px] text-rose-300/80">{creatorsStore.saveError}</p>
              )}

              <div className="mt-[14px]">
                <FieldLabel>Traits</FieldLabel>
                <div className="mt-[7px]">
                  <TraitsInput
                    traits={creator.traits}
                    onChange={(traits) => creatorsStore.updateTraits(creator.id, traits)}
                  />
                </div>
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Creative direction</FieldLabel>
                <NotesField
                  value={creator.creativeDirection}
                  onChange={(v) => creatorsStore.updateCreativeDirection(creator.id, v)}
                  placeholder="e.g. Works best with simple POV concepts and soft lifestyle content..."
                  rows={3}
                />
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Preferred talking style</FieldLabel>
                <div className="mt-[7px] flex flex-wrap gap-[6px]">
                  {TALKING_OPTIONS.map((opt) => (
                    <Chip
                      key={opt}
                      active={creator.preferredTalking === opt}
                      onClick={() => creatorsStore.updatePreferredTalking(creator.id, opt)}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Preferred language</FieldLabel>
                <div className="mt-[7px] flex flex-wrap gap-[6px]">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <Chip
                      key={opt}
                      active={creator.preferredLanguage === opt}
                      onClick={() => creatorsStore.updateField(creator.id, "preferredLanguage", opt)}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Preferred setting</FieldLabel>
                <div className="mt-[7px] flex flex-wrap gap-[6px]">
                  {SETTING_OPTIONS.map((opt) => (
                    <Chip
                      key={opt}
                      active={creator.preferredSetting === opt}
                      onClick={() => creatorsStore.updatePreferredSetting(creator.id, opt)}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Preferred content styles</FieldLabel>
                <div className="mt-[7px] flex flex-wrap gap-[6px]">
                  {CONTENT_STYLES.map((style) => (
                    <Chip
                      key={style}
                      active={creator.preferredStyles.includes(style)}
                      onClick={() => togglePreferredStyle(style)}
                    >
                      {style}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="mt-[16px]">
                <FieldLabel>Avoid</FieldLabel>
                <div className="mt-[7px]">
                  <TraitsInput
                    traits={creator.avoidedStyles}
                    onChange={(styles) => creatorsStore.updateAvoidedStyles(creator.id, styles)}
                    placeholder="e.g. heavy acting, complex scenes"
                  />
                </div>
              </div>

              <div className="mt-[16px] pt-[12px] border-t border-[#1c2025] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-[#e8eaee] font-medium">AI Brain</p>
                  <p className="text-[10px] text-[#7a7f88] leading-[14px]">
                    Opt in for future AI Creator Fit scoring. No effect yet.
                  </p>
                </div>
                <button
                  onClick={() =>
                    creatorsStore.updateField(creator.id, "aiBrainEnabled", !creator.aiBrainEnabled)
                  }
                  className={[
                    "shrink-0 w-[33px] h-[18px] rounded-[12px] flex items-center px-[1px] transition-colors duration-150",
                    creator.aiBrainEnabled ? "justify-end" : "bg-[#292c30] justify-start",
                  ].join(" ")}
                  style={creator.aiBrainEnabled ? { background: GOLD } : undefined}
                >
                  <span className="w-[16px] h-[16px] rounded-full bg-[#fafafa] block" />
                </button>
              </div>

              <p className="mt-[14px] text-[10px] text-[#7a7f88] leading-[15px]">
                Estimated only — Creator Fit and AI Score are mock previews for now, not a live
                scoring engine.
              </p>
            </Section>
          </div>
        </div>
      </div>

      <NewCollectionPanel
        open={createOpen}
        creators={[creator]}
        defaultCreatorId={creator.id}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, creatorId, note) => onCreateCollection(name, creatorId, note)}
      />
    </div>
  );
}
