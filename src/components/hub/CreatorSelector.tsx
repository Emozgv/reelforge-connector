import { ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import type { Creator } from "../../types";

export function CreatorSelector({
  creators,
  selected,
  onSelect,
}: {
  creators: Creator[];
  selected: Creator;
  onSelect: (c: Creator) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 h-11 pl-2 pr-4 rounded-full glass-panel hover:bg-white/[0.06] transition-colors"
      >
        <div className="w-6 h-6 rounded-full ring-1 ring-white/20" style={{ background: selected.avatarColor }} />
        <span className="text-[13.5px] text-neutral-100">{selected.name}</span>
        <ChevronDown size={14} className="text-neutral-500" />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-[52px] z-20 w-64 rounded-2xl glass-panel bg-[#141416]/95 shadow-2xl p-1.5 animate-fade-in"
        >
          {creators.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/[0.06] transition-colors"
            >
              <div
                className="w-6 h-6 rounded-full shrink-0 ring-1 ring-white/20"
                style={{ background: c.avatarColor }}
              />
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className="text-[12.5px] text-neutral-100 truncate">{c.name}</span>
                <span className="text-[11px] text-neutral-500 truncate">{c.handle}</span>
              </div>
              {c.id === selected.id && (
                <Check size={14} className="ml-auto text-[#d7a463] shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
