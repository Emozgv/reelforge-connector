import type { Creator } from "../../types";

// Dieselben Chips wie in ResearchAccountsPage (dort die Account-Auswahl):
// h-9, rounded-full, aktiv in #D39448 auf 16 % Fuellung mit 60 % Rand,
// inaktiv weisser 8-%-Rand mit Gold-Hover. Wortgleich uebernommen, damit
// beide Seiten dieselbe Sprache sprechen.
export function CreatorFilterBar({
  creators,
  activeId,
  onSelect,
}: {
  creators: Creator[];
  activeId: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  const base =
    "press-feedback group flex items-center gap-2 h-9 rounded-full border transition-all duration-150 shrink-0";
  const tone = (active: boolean) =>
    active
      ? "border-[#D39448]/60 bg-[#D39448]/[0.16] text-[#D39448]"
      : "border-white/[0.08] text-neutral-200 hover:text-neutral-50 hover:border-[#D39448]/35";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect("all")}
        className={[base, "px-3", tone(activeId === "all")].join(" ")}
      >
        <span className="text-[12.5px]">All</span>
      </button>

      {creators.map((c) => {
        const active = activeId === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={[base, "pl-1.5 pr-3", tone(active)].join(" ")}
          >
            <span
              className="w-[22px] h-[22px] rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
              style={c.profileImage ? undefined : { background: c.avatarColor }}
            >
              {c.profileImage && (
                <img src={c.profileImage} alt={c.name} className="w-full h-full object-cover" />
              )}
            </span>
            <span className="text-[12.5px]">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
