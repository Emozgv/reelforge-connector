import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CONTENT_STYLES } from "../../data/mockData";
import { DEFAULT_FILTERS, type HubFilters } from "./filterTypes";

function Section({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">{label}</span>
        {helper && <span className="text-[10.5px] text-neutral-600 italic">{helper}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
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
      className={[
        "text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors duration-150",
        active
          ? "border-[#d7a463]/45 bg-[#d7a463]/14 text-[#e8c896]"
          : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function FilterDrawer({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: HubFilters;
  onChange: (f: HubFilters) => void;
}) {
  const [draft, setDraft] = useState<HubFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function set<K extends keyof HubFilters>(key: K, value: HubFilters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function apply() {
    onChange(draft);
    onClose();
  }

  return (
    <>
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-30 bg-black/70 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      <div
        className={[
          "fixed left-0 right-0 bottom-0 z-40 bg-[#131315] border-t border-white/[0.08] shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out flex flex-col",
          "rounded-t-[20px] max-h-[76vh]",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <div className="shimmer-divider absolute -top-px left-0 right-0" />

        <div className="flex items-center justify-between px-8 h-16 border-b border-white/[0.07] shrink-0">
          <div>
            <span className="text-[15px] font-serif font-medium text-neutral-50">Refine results</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDraft(DEFAULT_FILTERS)}
              className="text-[12px] text-neutral-500 hover:text-[#e8c896] transition-colors duration-150"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors duration-150"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6 max-w-[1200px] mx-auto">
            <Section label="Platform">
              {(["all", "instagram", "tiktok"] as const).map((v) => (
                <Chip key={v} active={draft.platform === v} onClick={() => set("platform", v)}>
                  {v === "all" ? "All" : v === "instagram" ? "Instagram" : "TikTok"}
                </Chip>
              ))}
            </Section>

            <Section label="Length">
              {(
                [
                  ["any", "Any"],
                  ["0-5", "0–5s"],
                  ["6-9", "6–9s"],
                  ["10-12", "10–12s"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.length === v} onClick={() => set("length", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="Talking">
              {(
                [
                  ["any", "Any"],
                  ["talking", "Talking"],
                  ["nontalking", "Non-talking"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.talking === v} onClick={() => set("talking", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="AI-friendly">
              <Chip active={!draft.aiFriendly} onClick={() => set("aiFriendly", false)}>
                Any
              </Chip>
              <Chip active={draft.aiFriendly} onClick={() => set("aiFriendly", true)}>
                AI-ready only
              </Chip>
            </Section>

            <Section label="Difficulty">
              {(["any", "Easy", "Medium", "Hard"] as const).map((v) => (
                <Chip key={v} active={draft.difficulty === v} onClick={() => set("difficulty", v)}>
                  {v === "any" ? "Any" : v}
                </Chip>
              ))}
            </Section>

            <Section label="Setting">
              {(["any", "Indoor", "Outdoor"] as const).map((v) => (
                <Chip key={v} active={draft.setting === v} onClick={() => set("setting", v)}>
                  {v === "any" ? "Any" : v}
                </Chip>
              ))}
            </Section>

            <Section label="Content style">
              <Chip active={draft.contentStyle === "any"} onClick={() => set("contentStyle", "any")}>
                Any
              </Chip>
              {CONTENT_STYLES.map((v) => (
                <Chip key={v} active={draft.contentStyle === v} onClick={() => set("contentStyle", v)}>
                  {v}
                </Chip>
              ))}
            </Section>

            <Section label="Creator fit" helper="Estimated fit">
              {(
                [
                  ["any", "Any"],
                  ["high", "High (80%+)"],
                  ["medium", "Medium (50%+)"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.creatorFit === v} onClick={() => set("creatorFit", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="Used / Unused">
              {(
                [
                  ["any", "Any"],
                  ["used", "Used"],
                  ["unused", "Unused"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.used === v} onClick={() => set("used", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="Saved / Unsaved">
              {(
                [
                  ["any", "Any"],
                  ["saved", "Saved"],
                  ["unsaved", "Unsaved"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.savedState === v} onClick={() => set("savedState", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="Views">
              {(
                [
                  ["any", "Any"],
                  ["10k", "10K+"],
                  ["50k", "50K+"],
                  ["100k", "100K+"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.views === v} onClick={() => set("views", v)}>
                  {label}
                </Chip>
              ))}
            </Section>

            <Section label="Recent / Trending">
              {(
                [
                  ["relevant", "Most relevant"],
                  ["recent", "Recent"],
                  ["trending", "Trending"],
                ] as const
              ).map(([v, label]) => (
                <Chip key={v} active={draft.sort === v} onClick={() => set("sort", v)}>
                  {label}
                </Chip>
              ))}
            </Section>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-8 h-16 border-t border-white/[0.07] shrink-0">
          <button
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="h-9 px-4 rounded-lg text-[12.5px] text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.05] transition-colors duration-150"
          >
            Reset
          </button>
          <button
            onClick={apply}
            className="h-9 px-5 rounded-lg bg-[#d7a463] text-[#0a0a0c] text-[12.5px] font-medium hover:bg-[#e2b57c] transition-colors duration-150"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
