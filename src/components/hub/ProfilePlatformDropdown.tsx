import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { Platform } from "../../types";
import { PlatformIcon } from "./PlatformIcon";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
];

// Compact platform picker that sits inside the profile-lookup input, replacing
// a static icon — lets the profile flow target TikTok or Instagram
// independently from the niche-search platform toggle above it.
export function ProfilePlatformDropdown({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Choose a platform"
        className="flex items-center gap-1 h-7 pl-1.5 pr-1 rounded-full hover:bg-white/[0.06] transition-colors"
      >
        <PlatformIcon platform={value} size={13} />
        <ChevronDown size={11} className="text-neutral-500" />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-8 z-20 w-40 rounded-xl glass-panel bg-[#141416]/95 shadow-2xl p-1 animate-fade-in"
        >
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <PlatformIcon platform={p.id} size={12} />
              <span className="text-[12px] text-neutral-200">{p.label}</span>
              {p.id === value && <Check size={12} className="ml-auto text-[#D39448] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
