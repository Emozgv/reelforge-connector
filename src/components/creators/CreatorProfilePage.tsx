import { ArrowLeft, PackageCheck, Sparkles } from "lucide-react";
import type { Collection, Creator, Setting } from "../../types";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import { CONTENT_STYLES } from "../../data/mockData";
import { COLLECTION_STATUS_STYLES } from "../collections/CollectionRow";
import { DriveGlyph } from "../collections/DriveGlyph";
import { computeCreatorStats } from "./creatorStats";
import { TraitsInput } from "./TraitsInput";

const TALKING_OPTIONS: Creator["preferredTalking"][] = ["Talking", "Non-Talking", "Any"];
const SETTING_OPTIONS: (Setting | "Any")[] = ["Indoor", "Outdoor", "Any"];

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
          ? "border-[#c99a5f]/40 bg-[#c99a5f]/12 text-[#e8c896]"
          : "border-white/[0.07] text-neutral-400 hover:text-neutral-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function CreatorProfilePage({
  creator,
  collections,
  creatorsStore,
  onBack,
}: {
  creator: Creator;
  collections: Collection[];
  creatorsStore: CreatorsStore;
  onBack: () => void;
}) {
  const stats = computeCreatorStats(creator.id, collections);
  const ownCollections = collections.filter((c) => c.creatorId === creator.id);
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
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] font-medium text-[#0a0a0c] shrink-0 ring-1 ring-white/15"
            style={{ background: creator.avatarColor }}
          >
            {initials}
          </div>
          <div>
            <h1 className="text-[20px] font-serif font-medium text-neutral-50">{creator.name}</h1>
            <p className="text-[12.5px] text-neutral-500">{creator.handle}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 flex-wrap pb-3 mb-4 text-[12px] text-neutral-400">
          <span className="text-neutral-200 font-medium">{stats.collectionsCount} collections</span>
          <span>{stats.totalConcepts} concepts</span>
          <span>{stats.used} used</span>
          <span>{stats.unused} unused</span>
          {stats.activeSubmissions > 0 && (
            <span className="text-[#ddb87e]">{stats.activeSubmissions} active submissions</span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-6">
            <div>
              <h2 className="text-[13px] font-medium text-neutral-200 mb-2">Collections</h2>
              <div className="rounded-xl surface-panel divide-y divide-white/[0.05] overflow-hidden">
                {ownCollections.length === 0 && (
                  <p className="px-3.5 py-4 text-[12px] text-neutral-500">No collections yet.</p>
                )}
                {ownCollections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-[12.5px] text-neutral-200 truncate">{c.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-neutral-500">{c.concepts.length} concepts</span>
                      <span
                        className={[
                          "text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]",
                          COLLECTION_STATUS_STYLES[c.status],
                        ].join(" ")}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-[13px] font-medium text-neutral-200 mb-2 flex items-center gap-1.5">
                <PackageCheck size={13} className="text-[#ddb87e]" />
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
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {s.status === "Finished" && s.deliveryUrl && (
                        <a
                          href={s.deliveryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-[#e8c896] transition-colors"
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
          </div>

          {/* Creative Profile / AI Preferences */}
          <div className="sticky top-0 space-y-3">
            <div className="rounded-lg surface-panel p-3.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#c99a5f]" />
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
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">
                  Creative direction
                </label>
                <textarea
                  value={creator.creativeDirection}
                  onChange={(e) => creatorsStore.updateCreativeDirection(creator.id, e.target.value)}
                  rows={4}
                  placeholder="e.g. Works best with simple POV concepts and soft lifestyle content..."
                  className="mt-1.5 w-full resize-none rounded-md surface-field p-2.5 text-[12.5px] leading-relaxed text-neutral-300 placeholder:text-neutral-600 outline-none focus:border-[#c99a5f]/35 transition-colors duration-150"
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

              <p className="mt-4 text-[10.5px] text-neutral-600 leading-relaxed">
                Estimated only — Creator Fit and AI Score are mock previews for now, not a live
                scoring engine.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
