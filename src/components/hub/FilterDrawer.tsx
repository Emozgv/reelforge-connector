import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
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
        <span className="text-[10.5px] tracking-[0.08em] uppercase text-neutral-500 font-medium">{label}</span>
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
        "flex items-center gap-1 text-[12px] pl-2.5 pr-3 py-[7px] rounded-full border transition-all duration-200 ease-out",
        active
          ? "border-[#D39448]/50 bg-[#D39448]/[0.14] text-[#D39448] shadow-[0_0_0_1px_rgba(211,148,72,0.08)]"
          : "border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:border-white/[0.16] hover:bg-white/[0.04]",
      ].join(" ")}
    >
      {active && <Check size={11} strokeWidth={2.5} />}
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
          "fixed inset-0 z-30 bg-black/75 backdrop-blur-[6px] transition-opacity duration-300 ease-out",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      <div
        className={[
          "fixed left-0 right-0 bottom-0 z-40 bg-[#131315]/98 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-24px_60px_-16px_rgba(0,0,0,0.7)] flex flex-col",
          "rounded-t-[24px] max-h-[76vh]",
          "transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.19,1,0.22,1)]",
          open ? "translate-y-0 opacity-100" : "translate-y-[12px] opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-white/[0.14]" />

        <div className="flex items-center justify-between px-8 h-16 border-b border-white/[0.07] shrink-0">
          <div>
            <span className="text-[19px] font-serif text-neutral-50">Refine results</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDraft(DEFAULT_FILTERS)}
              className="text-[12px] text-neutral-500 hover:text-[#D39448] transition-colors duration-150"
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
          <div className="max-w-[1000px] mx-auto space-y-8">
            {/* Compact filters — even 3-column grid, each with a short chip row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6">
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

              <Section label="Sort">
                {(
                  [
                    ["relevant", "Most relevant"],
                    ["recent", "Recent"],
                    ["mostViewed", "Most viewed"],
                  ] as const
                ).map(([v, label]) => (
                  <Chip key={v} active={draft.sort === v} onClick={() => set("sort", v)}>
                    {label}
                  </Chip>
                ))}
              </Section>
            </div>

            {/* Content Style — its own full-width row, more options than the rest */}
            <div className="pt-6 border-t border-white/[0.06]">
              <Section label="Content style" helper="the hook/format, not the niche">
                <Chip active={draft.contentStyle === "any"} onClick={() => set("contentStyle", "any")}>
                  Any
                </Chip>
                {CONTENT_STYLES.map((v) => (
                  <Chip key={v} active={draft.contentStyle === v} onClick={() => set("contentStyle", v)}>
                    {v}
                  </Chip>
                ))}
              </Section>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-8 h-16 border-t border-white/[0.07] shrink-0">
          <button
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="h-9 px-4 rounded-full text-[12.5px] text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.05] transition-colors duration-150"
          >
            Reset
          </button>
          <button
            onClick={apply}
            className="h-9 px-5 rounded-full bg-[#D39448] text-[#020508] text-[12.5px] font-medium hover:bg-[#e2b57c] transition-colors duration-150 press-feedback"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
