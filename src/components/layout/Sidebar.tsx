import { Sparkles, FolderHeart, Users, Clapperboard, Library, Settings } from "lucide-react";

export type Page = "hub" | "collections" | "creators" | "production" | "library" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "hub", label: "Creativity Hub", icon: <Sparkles size={15} strokeWidth={1.75} /> },
  { id: "collections", label: "Collections", icon: <FolderHeart size={15} strokeWidth={1.75} /> },
  { id: "creators", label: "Creators", icon: <Users size={15} strokeWidth={1.75} /> },
  { id: "production", label: "Production", icon: <Clapperboard size={15} strokeWidth={1.75} /> },
  { id: "library", label: "Library", icon: <Library size={15} strokeWidth={1.75} /> },
  { id: "settings", label: "Settings", icon: <Settings size={15} strokeWidth={1.75} /> },
];

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  return (
    <aside className="relative z-10 w-[212px] xl:w-[236px] 2xl:w-[260px] shrink-0 h-full border-r border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-xl flex flex-col">
      <div className="h-14 xl:h-16 flex items-center px-4 xl:px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 xl:gap-2.5">
          <div className="w-5 h-5 xl:w-6 xl:h-6 rounded-[5px] bg-[#c99a5f] flex items-center justify-center">
            <div className="w-1.5 h-2 xl:w-2 xl:h-2.5 rounded-[1px] bg-[#0a0a0c]" />
          </div>
          <span className="text-[13.5px] xl:text-[15px] font-serif font-medium text-neutral-100 tracking-tight">
            ReelForge
          </span>
        </div>
      </div>

      <nav className="flex-1 px-2.5 xl:px-3.5 py-3 xl:py-4 space-y-px xl:space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.id === page;
          const disabled = item.id !== "hub" && item.id !== "collections";
          return (
            <button
              key={item.id}
              disabled={disabled}
              onClick={() => onNavigate(item.id)}
              className={[
                "relative w-full flex items-center gap-2.5 xl:gap-3 px-2.5 xl:px-3 py-[7px] xl:py-2 rounded-md text-[12.5px] xl:text-[13.5px] transition-colors duration-150",
                active
                  ? "text-neutral-100 bg-white/[0.05]"
                  : disabled
                  ? "text-neutral-600 cursor-not-allowed"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.035]",
              ].join(" ")}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-full bg-[#c99a5f]" />
              )}
              <span className={active ? "text-[#ddb87e]" : ""}>{item.icon}</span>
              {item.label}
              {disabled && (
                <span className="ml-auto text-[9px] tracking-wide uppercase text-neutral-600 border border-white/[0.08] rounded-[3px] px-1 py-[1px]">
                  soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2.5 xl:p-3.5 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 xl:gap-3 px-2 xl:px-2.5 py-2 xl:py-2.5 rounded-md hover:bg-white/[0.035] transition-colors duration-150 cursor-pointer">
          <div className="w-6 h-6 xl:w-7 xl:h-7 rounded-full bg-[#c99a5f] flex items-center justify-center text-[10.5px] xl:text-[11px] font-medium text-[#0a0a0c]">
            EM
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] xl:text-[12.5px] text-neutral-200">Emre</span>
            <span className="text-[10.5px] xl:text-[11px] text-neutral-500">Client workspace</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
