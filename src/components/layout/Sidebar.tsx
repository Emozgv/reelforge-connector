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
    <aside className="relative z-20 w-[212px] xl:w-[236px] 2xl:w-[260px] shrink-0 h-full border-r border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-xl flex flex-col">
      <div className="h-14 xl:h-16 flex items-center justify-between px-4 xl:px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 xl:gap-2.5">
          <div
            className="w-[22px] h-5 xl:w-[26px] xl:h-6 shrink-0"
            style={{
              WebkitMaskImage: "url(/rf-mark.png)",
              maskImage: "url(/rf-mark.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: "linear-gradient(135deg, #e8c896, #c99a5f)",
            }}
          />
          <span className="font-brand text-[14.5px] xl:text-[16px] text-neutral-100">ReelForge</span>
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
              <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
                <p className="text-[10.5px] tracking-wide uppercase text-neutral-500">Notifications</p>
                {unread && (
                  <button
                    onClick={markAllRead}
                    className="text-[10.5px] text-neutral-500 hover:text-[#e8c896] transition-colors duration-150"
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
                      "relative w-full flex items-center gap-2.5 xl:gap-3 px-2.5 xl:px-3 py-[7px] xl:py-2 rounded-md text-[12.5px] xl:text-[13.5px] transition-colors duration-150 border",
                      active
                        ? "text-neutral-100 bg-[#c99a5f]/[0.09] border-[#c99a5f]/30"
                        : "text-neutral-400 border-transparent hover:text-neutral-100 hover:bg-white/[0.035]",
                    ].join(" ")}
                  >
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
