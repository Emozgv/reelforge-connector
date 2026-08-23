import { useState } from "react";
import {
  LayoutDashboard,
  Sparkles,
  FolderHeart,
  Users,
  Clapperboard,
  Library,
  Settings,
  LogOut,
  Bell,
} from "lucide-react";
import type { ActivityFeedItem } from "../../state/useActivityFeed";

export type Page = "dashboard" | "hub" | "collections" | "creators" | "production" | "library" | "settings";

const NAV_GROUPS: { label: string; items: { id: Page; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} strokeWidth={1.75} /> },
      { id: "hub", label: "Creativity Hub", icon: <Sparkles size={15} strokeWidth={1.75} /> },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "collections", label: "Collections", icon: <FolderHeart size={15} strokeWidth={1.75} /> },
      { id: "production", label: "Production", icon: <Clapperboard size={15} strokeWidth={1.75} /> },
      { id: "library", label: "Library", icon: <Library size={15} strokeWidth={1.75} /> },
    ],
  },
  {
    label: "Management",
    items: [
      { id: "creators", label: "Creators", icon: <Users size={15} strokeWidth={1.75} /> },
      { id: "settings", label: "Settings", icon: <Settings size={15} strokeWidth={1.75} /> },
    ],
  },
];

export function Sidebar({
  page,
  onNavigate,
  userEmail,
  displayName,
  workspaceName,
  onSignOut,
  activity,
  onOpenCollection,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  userEmail?: string;
  displayName?: string;
  workspaceName?: string;
  onSignOut?: () => void;
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenCollection: (collectionId: string) => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const shownName = displayName || userEmail;
  const initials = shownName ? shownName.slice(0, 2).toUpperCase() : "EM";
  const unread = activity.items.length > 0 && new Date(activity.items[0].createdAtRaw).getTime() > Date.now() - 24 * 60 * 60 * 1000;

  return (
    <aside className="relative z-10 w-[212px] xl:w-[236px] 2xl:w-[260px] shrink-0 h-full border-r border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-xl flex flex-col">
      <div className="h-14 xl:h-16 flex items-center justify-between px-4 xl:px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 xl:gap-2.5">
          <div className="w-5 h-5 xl:w-6 xl:h-6 rounded-[5px] bg-[#c99a5f] flex items-center justify-center">
            <div className="w-1.5 h-2 xl:w-2 xl:h-2.5 rounded-[1px] bg-[#0a0a0c]" />
          </div>
          <span className="text-[13.5px] xl:text-[15px] font-serif font-medium text-neutral-100 tracking-tight">
            ReelForge
          </span>
        </div>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05] transition-colors duration-150"
          >
            <Bell size={14} strokeWidth={1.75} />
            {unread && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#d7a463]" />}
          </button>
          {notifOpen && (
            <div
              onMouseLeave={() => setNotifOpen(false)}
              className="absolute left-0 top-9 z-30 w-72 rounded-xl surface-panel-strong p-1 animate-fade-in"
            >
              <p className="px-2.5 pt-2 pb-1.5 text-[10.5px] tracking-wide uppercase text-neutral-500">
                Recent activity
              </p>
              <div className="max-h-[300px] overflow-y-auto">
                {activity.items.length === 0 && (
                  <p className="px-2.5 py-3 text-[11.5px] text-neutral-600">Nothing yet.</p>
                )}
                {activity.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.collectionId) onOpenCollection(item.collectionId);
                      setNotifOpen(false);
                    }}
                    disabled={!item.collectionId}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors duration-150 disabled:hover:bg-transparent"
                  >
                    <p className="text-[12px] text-neutral-200 leading-snug">{item.message}</p>
                    <p className="text-[10.5px] text-neutral-600 mt-0.5">{item.relativeTime}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-2.5 xl:px-3.5 py-3 xl:py-4 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-4" : ""}>
            <p className="px-2.5 xl:px-3 mb-1 text-[10px] tracking-[0.08em] uppercase text-neutral-600 font-medium">
              {group.label}
            </p>
            <div className="space-y-px xl:space-y-0.5">
              {group.items.map((item) => {
                const active = item.id === page;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigate(item.id);
                    }}
                    className={[
                      "relative w-full flex items-center gap-2.5 xl:gap-3 px-2.5 xl:px-3 py-[7px] xl:py-2 rounded-md text-[12.5px] xl:text-[13.5px] transition-colors duration-150",
                      active
                        ? "text-neutral-100 bg-white/[0.05]"
                        : "text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.035]",
                    ].join(" ")}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-full bg-[#c99a5f]" />
                    )}
                    <span className={active ? "text-[#ddb87e]" : ""}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2.5 xl:p-3.5 border-t border-white/[0.06]">
        <div className="group flex items-center gap-2.5 xl:gap-3 px-2 xl:px-2.5 py-2 xl:py-2.5 rounded-md hover:bg-white/[0.035] transition-colors duration-150">
          <div className="w-6 h-6 xl:w-7 xl:h-7 rounded-full bg-[#c99a5f] flex items-center justify-center text-[10.5px] xl:text-[11px] font-medium text-[#0a0a0c] shrink-0">
            {initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[12px] xl:text-[12.5px] text-neutral-200 truncate">
              {displayName || workspaceName || "Client workspace"}
            </span>
            <span className="text-[10.5px] xl:text-[11px] text-neutral-500 truncate">
              {userEmail ?? "Emre"}
            </span>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              title="Sign out"
              className="ml-auto shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-neutral-200 hover:bg-white/[0.06] transition-all duration-150"
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
