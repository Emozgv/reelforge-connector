import type { Creator } from "../../types";

export function CreatorFilterBar({
  creators,
  activeId,
  onSelect,
}: {
  creators: Creator[];
  activeId: string | "all";
  onSelect: (id: string | "all") => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onSelect("all")}
        className={[
          "h-8 px-3 rounded-md text-[12.5px] transition-colors duration-150",
          activeId === "all"
            ? "bg-white/[0.07] text-neutral-100"
            : "text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04]",
        ].join(" ")}
      >
        All
      </button>
      {creators.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={[
            "flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-md text-[12.5px] transition-colors duration-150",
            activeId === c.id
              ? "bg-white/[0.07] text-neutral-100"
              : "text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04]",
          ].join(" ")}
        >
          <span className="w-4 h-4 rounded-full shrink-0" style={{ background: c.avatarColor }} />
          {c.name}
        </button>
      ))}
    </div>
  );
}
