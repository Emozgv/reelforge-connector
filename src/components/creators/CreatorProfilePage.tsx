import { useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CreditCard, ImagePlus, PackageCheck, Plus, Sparkles, X } from "lucide-react";
import type { Collection, Creator, CreatorPackage, Language, Setting } from "../../types";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import { CONTENT_STYLES } from "../../data/mockData";
import { creatorSetupStatus } from "../../lib/creatorMapping";
import { computeCreatorUsageStats } from "../../lib/creatorUsageStats";
import { planBadgeLabel, planBadgeStyle, planPriceLabel } from "../../lib/planDisplay";
import { COLLECTION_STATUS_STYLES, effectiveCollectionStatus } from "../collections/CollectionRow";
import { DriveGlyph } from "../collections/DriveGlyph";
import { NewCollectionPanel } from "../collections/NewCollectionPanel";
import { computeCreatorStats } from "./creatorStats";
import { TraitsInput } from "./TraitsInput";

const TALKING_OPTIONS: Creator["preferredTalking"][] = ["Talking", "Non-Talking", "Any"];
const SETTING_OPTIONS: (Setting | "Any")[] = ["Indoor", "Outdoor", "Any"];
const LANGUAGE_OPTIONS: (Language | "Any")[] = ["Any", "English", "Spanish", "German", "Non-verbal"];

const SETUP_STATUS_LABEL: Record<ReturnType<typeof creatorSetupStatus>, string> = {
  draft: "Setup: Draft",
  in_progress: "Setup: In progress",
  ready: "Setup: Ready",
};
const SETUP_STATUS_STYLE: Record<ReturnType<typeof creatorSetupStatus>, string> = {
  draft: "text-neutral-500 bg-white/[0.05]",
  in_progress: "text-amber-300/80 bg-amber-400/10",
  ready: "text-emerald-300/80 bg-emerald-400/10",
};

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
      className={[
        "text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors duration-150",
        active
          ? "border-[#D39448]/40 bg-[#D39448]/12 text-[#D39448]"
          : "border-white/[0.07] text-neutral-400 hover:text-neutral-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">{children}</label>;
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
      className="mt-1.5 w-full resize-none rounded-md surface-field p-2.5 text-[12.5px] leading-relaxed text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
    />
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={[
          "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
          done ? "bg-emerald-400/20 text-emerald-300" : "bg-white/[0.06] text-neutral-600",
        ].join(" ")}
      >
        {done ? <Check size={10} strokeWidth={3} /> : <span className="w-1 h-1 rounded-full bg-current" />}
      </div>
      <span className={["text-[12px]", done ? "text-neutral-300" : "text-neutral-500"].join(" ")}>{label}</span>
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
  onOpenCollection,
  onCreateCollection,
}: {
  creator: Creator;
  collections: Collection[];
  creatorsStore: CreatorsStore;
  plan: CreatorPackage | undefined;
  onOpenBilling: () => void;
  onBack: () => void;
  onOpenCollection: (collectionId: string) => void;
  onCreateCollection: (name: string, creatorId: string, note: string) => void;
}) {
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
  const ownCollections = collections
    .filter((c) => c.creatorId === creator.id)
    .sort((a, b) => Number(b.name === "Quick Saves") - Number(a.name === "Quick Saves"));
  const allSubmissions = ownCollections
    .flatMap((c) => c.submissions.map((s) => ({ ...s, collectionName: c.name })))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

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

  return (
    <div className="h-full overflow-y-auto animate-fade-in">
      <div className="max-w-[1360px] mx-auto px-8 pt-6 pb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 transition-colors duration-150 mb-4"
        >
          <ArrowLeft size={13} />
          All creators
        </button>

        <div className="flex items-center gap-3.5 pb-4 mb-5 border-b border-white/[0.06]">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Change profile photo"
            className="group relative w-14 h-14 rounded-full flex items-center justify-center text-[16px] font-medium text-[#020508] shrink-0 ring-1 ring-white/15 overflow-hidden"
            style={creator.profileImage ? undefined : { background: creator.avatarColor }}
          >
            {creator.profileImage ? (
              <img src={creator.profileImage} alt={creator.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              initials
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {uploadingPhoto ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Camera size={16} className="text-white" />
              )}
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-serif font-medium text-neutral-50 truncate">{creator.name}</h1>
              <span
                className={["shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]", SETUP_STATUS_STYLE[setupStatus]].join(" ")}
              >
                {SETUP_STATUS_LABEL[setupStatus]}
              </span>
            </div>
            <p className="text-[12.5px] text-neutral-500">{creator.handle}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 flex-wrap pb-3 mb-4 text-[12px] text-neutral-400">
          <span className="text-neutral-200 font-medium">{stats.collectionsCount} collections</span>
          <span>{stats.totalConcepts} concepts</span>
          <span>{stats.used} used</span>
          <span>{stats.unused} unused</span>
          {stats.activeSubmissions > 0 && (
            <span className="text-[#D39448]">{stats.activeSubmissions} active submissions</span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-6">
            {setupStatus !== "ready" && (
              <div className="rounded-xl border border-[#D39448]/25 bg-[#D39448]/[0.06] p-4">
                <h2 className="text-[13px] font-medium text-neutral-100 mb-2.5">Setup checklist</h2>
                <div className="space-y-1.5">
                  <ChecklistRow done={!!creator.profileImage} label="Profile photo" />
                  <ChecklistRow done={creator.referencePhotos.length >= 3} label="At least 3 reference photos" />
                  <ChecklistRow
                    done={creator.bodyNotes.trim() !== "" || creator.identityNotes.trim() !== ""}
                    label="Body / identity notes"
                  />
                  <ChecklistRow
                    done={creator.contentDos.trim() !== "" || creator.contentDonts.trim() !== "" || creator.creativeDirection.trim() !== ""}
                    label="Content direction"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[13px] font-medium text-neutral-200">Collections</h2>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1 text-[11.5px] text-neutral-400 hover:text-[#D39448] transition-colors duration-150"
                >
                  <Plus size={12} />
                  New Collection
                </button>
              </div>
              <div className="rounded-xl surface-panel divide-y divide-white/[0.05] overflow-hidden">
                {ownCollections.length === 0 && (
                  <p className="px-3.5 py-4 text-[12px] text-neutral-500">No collections yet.</p>
                )}
                {ownCollections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onOpenCollection(c.id)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-colors duration-150"
                  >
                    <span className="text-[12.5px] text-neutral-200 truncate">{c.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-neutral-500">{c.concepts.length} concepts</span>
                      <span
                        className={[
                          "text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
                          COLLECTION_STATUS_STYLES[effectiveCollectionStatus(c)],
                        ].join(" ")}
                      >
                        {effectiveCollectionStatus(c)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-[13px] font-medium text-neutral-200 mb-2 flex items-center gap-1.5">
                <PackageCheck size={13} className="text-[#D39448]" />
                Submissions
              </h2>
              <div className="rounded-xl surface-panel divide-y divide-white/[0.05] overflow-hidden">
                {allSubmissions.length === 0 && (
                  <p className="px-3.5 py-4 text-[12px] text-neutral-500">No submissions yet.</p>
                )}
                {allSubmissions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-neutral-200 truncate">
                        {s.collectionName} · Submission #{s.index}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {s.conceptIds.length} concepts · {s.sentAt}
                        {s.eta && s.status !== "Finished" && s.status !== "Cancelled" && (
                          <> · ETA {s.eta}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {s.status === "Finished" && s.deliveryUrl && (
                        <a
                          href={s.deliveryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-[#D39448] transition-colors"
                        >
                          <DriveGlyph size={11} />
                          Drive
                        </a>
                      )}
                      <span className="text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] text-neutral-400 bg-white/[0.05]">
                        {s.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Character & Identity — the visual anchor Production works from */}
            <div className="rounded-lg surface-panel p-3.5">
              <h2 className="text-[13px] font-medium text-neutral-100">Character &amp; identity</h2>
              <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
                Reference photos and body/identity notes Production uses to keep this Creator consistent.
              </p>

              <div className="mt-4">
                <FieldLabel>Reference photos ({creator.referencePhotos.length}/5)</FieldLabel>
                <div className="mt-1.5 grid grid-cols-5 gap-2">
                  {creator.referencePhotos.map((url) => (
                    <div key={url} className="group relative aspect-square rounded-lg overflow-hidden ring-1 ring-white/10">
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
                      className="aspect-square rounded-lg border border-dashed border-white/15 flex items-center justify-center text-neutral-500 hover:text-neutral-300 hover:border-white/25 transition-colors duration-150"
                    >
                      {uploadingReference ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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

              <div className="mt-4 grid grid-cols-2 gap-3">
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

              <div className="mt-3">
                <FieldLabel>Hair / face / identity notes</FieldLabel>
                <NotesField
                  value={creator.identityNotes}
                  onChange={(v) => creatorsStore.updateField(creator.id, "identityNotes", v)}
                  placeholder="Hair color/length, distinguishing features..."
                />
              </div>
            </div>

            {/* Direction — do's/don'ts and brand tone */}
            <div className="rounded-lg surface-panel p-3.5">
              <h2 className="text-[13px] font-medium text-neutral-100">Direction</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
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
              <div className="mt-3">
                <FieldLabel>Preferred outfits &amp; settings</FieldLabel>
                <NotesField
                  value={creator.preferredOutfits}
                  onChange={(v) => creatorsStore.updateField(creator.id, "preferredOutfits", v)}
                  placeholder="Typical wardrobe..."
                  rows={2}
                />
                <NotesField
                  value={creator.settingNotes}
                  onChange={(v) => creatorsStore.updateField(creator.id, "settingNotes", v)}
                  placeholder="Typical settings beyond indoor/outdoor..."
                  rows={2}
                />
              </div>
              <div className="mt-3">
                <FieldLabel>Brand direction</FieldLabel>
                <NotesField
                  value={creator.brandDirection}
                  onChange={(v) => creatorsStore.updateField(creator.id, "brandDirection", v)}
                  placeholder="Overall tone and positioning for this Creator..."
                />
              </div>
            </div>

            <div className="rounded-lg surface-panel p-3.5">
              <h2 className="text-[13px] font-medium text-neutral-100">Notes</h2>
              <NotesField
                value={creator.clientNotes}
                onChange={(v) => creatorsStore.updateField(creator.id, "clientNotes", v)}
                placeholder="Internal notes..."
              />
            </div>

            <div className="rounded-lg surface-panel p-3.5">
              <h2 className="text-[13px] font-medium text-neutral-100">Notes from ReelForge</h2>
              <p className="mt-2 text-[12px] text-neutral-600 leading-relaxed">
                Nothing from the ReelForge team yet — this fills in once Internal can write back to this Creator's profile.
              </p>
            </div>
          </div>

          {/* Creative Profile / AI Preferences */}
          <div className="space-y-3">
            <div className="rounded-lg surface-panel p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CreditCard size={13} className="text-[#D39448]" />
                  <h2 className="text-[13px] font-medium text-neutral-100">Plan</h2>
                </div>
                <button
                  onClick={onOpenBilling}
                  className="text-[11px] text-neutral-500 hover:text-[#D39448] transition-colors duration-150"
                >
                  Billing
                </button>
              </div>

              <span className={["mt-2.5 inline-block text-[11px] font-medium px-2 py-[3px] rounded-full", planBadgeStyle(plan)].join(" ")}>
                {planBadgeLabel(plan)}
              </span>

              {plan ? (
                (() => {
                  const usage = computeCreatorUsageStats(plan, collections);
                  const pct = plan.planTier === "Enterprise" ? 0 : Math.min(100, (usage.reelsUsed / usage.reelsTotal) * 100);
                  return (
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="text-neutral-300">
                          {plan.planTier === "Enterprise" ? (
                            "Pooled Enterprise allowance"
                          ) : (
                            <>
                              <span className="text-neutral-100 font-medium tabular-nums">{usage.reelsUsed}</span>
                              <span className="text-neutral-500"> / {usage.reelsTotal} reels</span>
                            </>
                          )}
                        </span>
                        <span className="text-neutral-500">{planPriceLabel(plan)}</span>
                      </div>
                      {plan.planTier !== "Enterprise" && (
                        <div className="relative mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#A97942] to-[#D39448]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      <p className="mt-2 text-[10.5px] text-neutral-600">
                        Cycle started{" "}
                        {new Date(plan.billingCycleStart).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                        {usage.paidRegenerationsUsed > 0 && ` · ${usage.paidRegenerationsUsed} paid regeneration${usage.paidRegenerationsUsed === 1 ? "" : "s"} used`}
                      </p>
                    </div>
                  );
                })()
              ) : (
                <p className="mt-2.5 text-[11.5px] text-neutral-500 leading-relaxed">
                  This creator has no active ReelForge plan. Reels can't be produced for them until one is set up.
                </p>
              )}
            </div>

            <div className="rounded-lg surface-panel p-3.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#D39448]" />
                <h2 className="text-[13px] font-medium text-neutral-100">Creative Profile</h2>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
                Tell ReelForge what fits this Creator. Used to improve future concept matching and
                recommendations.
              </p>

              {creatorsStore.saveError && (
                <p className="mt-2 text-[11px] text-rose-300/80">{creatorsStore.saveError}</p>
              )}

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Traits</label>
                <div className="mt-1.5">
                  <TraitsInput
                    traits={creator.traits}
                    onChange={(traits) => creatorsStore.updateTraits(creator.id, traits)}
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel>Creative direction</FieldLabel>
                <NotesField
                  value={creator.creativeDirection}
                  onChange={(v) => creatorsStore.updateCreativeDirection(creator.id, v)}
                  placeholder="e.g. Works best with simple POV concepts and soft lifestyle content..."
                  rows={4}
                />
              </div>

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Preferred talking style
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
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

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Preferred language
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
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

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Preferred setting
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
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

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Preferred content styles
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
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

              <div className="mt-4">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Avoid
                </label>
                <div className="mt-1.5">
                  <TraitsInput
                    traits={creator.avoidedStyles}
                    onChange={(styles) => creatorsStore.updateAvoidedStyles(creator.id, styles)}
                    placeholder="e.g. heavy acting, complex scenes"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-neutral-300 font-medium">AI Brain</p>
                  <p className="text-[10.5px] text-neutral-600 leading-relaxed">
                    Opt in for future AI Creator Fit scoring. No effect yet.
                  </p>
                </div>
                <button
                  onClick={() => creatorsStore.updateField(creator.id, "aiBrainEnabled", !creator.aiBrainEnabled)}
                  className={[
                    "shrink-0 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors duration-150",
                    creator.aiBrainEnabled ? "bg-[#D39448] justify-end" : "bg-white/10 justify-start",
                  ].join(" ")}
                >
                  <span className="w-4 h-4 rounded-full bg-white block" />
                </button>
              </div>

              <p className="mt-4 text-[10.5px] text-neutral-600 leading-relaxed">
                Estimated only — Creator Fit and AI Score are mock previews for now, not a live
                scoring engine.
              </p>
            </div>
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
