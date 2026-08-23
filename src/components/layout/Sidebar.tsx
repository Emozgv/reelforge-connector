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
import type { ActivityEventType } from "../../lib/activityMapping";

// The bell is for things worth interrupting the client for — not a mirror of
// every log line (that full trail lives in Dashboard/Collection history).
const NOTABLE_EVENT_TYPES: ActivityEventType[] = ["submission_created", "regeneration_requested"];

// Read state is a per-browser affordance (localStorage), not a synced backend
// concept — matches the single-workspace-per-browser assumption elsewhere.
const LAST_READ_KEY = "reelforge_notifications_last_read_at";

export type Page = "dashboard" | "hub" | "collections" | "creators" | "production" | "library" | "settings";

const NAV_GROUPS: { label: string; items: { id: Page; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} strokeWidth={1.75} /> },
      { id: "hub", label: "Creativity Hub", icon: <Sparkles size={16} strokeWidth={1.75} /> },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "collections", label: "Collections", icon: <FolderHeart size={16} strokeWidth={1.75} /> },
      { id: "production", label: "Production", icon: <Clapperboard size={16} strokeWidth={1.75} /> },
      { id: "library", label: "Library", icon: <Library size={16} strokeWidth={1.75} /> },
    ],
  },
  {
    label: "Management",
    items: [
      { id: "creators", label: "Creators", icon: <Users size={16} strokeWidth={1.75} /> },
      { id: "settings", label: "Settings", icon: <Settings size={16} strokeWidth={1.75} /> },
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
  const [lastReadAt, setLastReadAt] = useState(() => Number(localStorage.getItem(LAST_READ_KEY) ?? 0));
  const shownName = displayName || userEmail;
  const initials = shownName ? shownName.slice(0, 2).toUpperCase() : "EM";
  const notifications = activity.items.filter((item) => NOTABLE_EVENT_TYPES.includes(item.eventType));
  const unread = notifications.length > 0 && new Date(notifications[0].createdAtRaw).getTime() > lastReadAt;

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(LAST_READ_KEY, String(now));
    setLastReadAt(now);
  }

  return (
    <aside className="relative z-20 w-[240px] xl:w-[264px] 2xl:w-[288px] shrink-0 h-full border-r border-white/[0.06] bg-[#020508]/80 backdrop-blur-xl flex flex-col">
      <div className="h-16 xl:h-[72px] flex items-center justify-between px-5 xl:px-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5 xl:gap-3">
          <div
            className="w-[26px] h-6 xl:w-[30px] xl:h-7 shrink-0"
            style={{
              WebkitMaskImage: "url(/rf-mark.png)",
              maskImage: "url(/rf-mark.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: "linear-gradient(135deg, #D39448, #A97942)",
            }}
          />
          <span className="font-brand text-[16.5px] xl:text-[18px] text-neutral-100">ReelForge</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative w-8 h-8 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05] transition-colors duration-150"
          >
            <Bell size={16} strokeWidth={1.75} />
            {unread && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#D39448]" />}
          </button>
          {notifOpen && (
            <div
              onMouseLeave={() => setNotifOpen(false)}
              className="absolute left-0 top-9 z-30 w-72 rounded-xl surface-panel-strong p-1 animate-fade-in"
            >
              <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
                <p className="text-[10.5px] tracking-wide uppercase text-neutral-500">Notifications</p>
                {unread && (
                  <button
                    onClick={markAllRead}
                    className="text-[10.5px] text-neutral-500 hover:text-[#D39448] transition-colors duration-150"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="px-2.5 py-3 text-[11.5px] text-neutral-600">Nothing yet.</p>
                )}
                {notifications.map((item) => (
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

      <nav className="flex-1 px-3 xl:px-4 py-4 xl:py-5 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-5" : ""}>
            <p className="px-3 mb-1.5 text-[10.5px] tracking-[0.1em] uppercase text-neutral-600 font-medium">
              {group.label}
            </p>
            <div className="space-y-1">
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
                      "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] xl:text-[14.5px] transition-colors duration-150 border",
                      active
                        ? "text-neutral-100 bg-[#D39448]/[0.1] border-[#D39448]/30"
                        : "text-neutral-400 border-transparent hover:text-neutral-100 hover:bg-white/[0.035]",
                    ].join(" ")}
                  >
                    <span className={active ? "text-[#D39448]" : ""}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3.5 xl:p-4 border-t border-white/[0.06]">
        <div className="group flex items-center gap-3 px-2.5 xl:px-3 py-2.5 xl:py-3 rounded-lg hover:bg-white/[0.035] transition-colors duration-150">
          <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-full bg-gradient-to-br from-[#D39448] to-[#A97942] flex items-center justify-center text-[11.5px] xl:text-[12px] font-medium text-[#020508] shrink-0">
            {initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[13px] xl:text-[13.5px] text-neutral-200 truncate">
              {displayName || workspaceName || "Client workspace"}
            </span>
            <span className="text-[11px] xl:text-[11.5px] text-neutral-500 truncate">
              {userEmail ?? "Emre"}
            </span>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              title="Sign out"
              className="ml-auto shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-neutral-200 hover:bg-white/[0.06] transition-all duration-150"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
