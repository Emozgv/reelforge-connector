import type { Creator } from "../../types";

// Figma node 3368:23 — the chip row above the creator sections.
// Exact values, not approximated:
//   chip        h44, radius 22, px17, gap 12, text 13px
//   inactive    bg rgba(8,9,10,0.65), border #222326, text #bbb9bd
//   active      border #d08d36, bg rgba(122,76,25,0.15), text #f1eee8,
//               inset shadow 0 0 13px rgba(209,143,52,0.06)
//   dot         19px round, creator colour, glow 0 0 10px <colour>
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
    "flex items-center h-[34px] px-[14px] rounded-full text-[12.5px] transition-colors duration-150 shrink-0";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect("all")}
        className={[
          base,
          activeId === "all"
            ? "border border-[#d08d36] text-[#f1eee8]"
            : "border border-[#222326] bg-[rgba(8,9,10,0.65)] text-[#bbb9bd] hover:border-[#32333a]",
        ].join(" ")}
        style={
          activeId === "all"
            ? {
                background: "rgba(122,76,25,0.15)",
                boxShadow: "inset 0 0 13px 0 rgba(209,143,52,0.06)",
              }
            : undefined
        }
      >
        All
      </button>

      {creators.map((c) => {
        const active = activeId === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={[
              base,
              "gap-2",
              active
                ? "border border-[#d08d36] text-[#f1eee8]"
                : "border border-[#222326] bg-[rgba(8,9,10,0.65)] text-[#bbb9bd] hover:border-[#32333a]",
            ].join(" ")}
            style={
              active
                ? { background: "rgba(122,76,25,0.15)", boxShadow: "inset 0 0 13px 0 rgba(209,143,52,0.06)" }
                : undefined
            }
          >
            <span
              className="w-[15px] h-[15px] rounded-full shrink-0 overflow-hidden"
              style={
                c.profileImage
                  ? undefined
                  : { background: c.avatarColor, boxShadow: `0 0 10px 0 ${c.avatarColor}` }
              }
            >
              {c.profileImage && (
                <img src={c.profileImage} alt={c.name} className="w-full h-full object-cover" />
              )}
            </span>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
