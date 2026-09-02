import { useState } from "react";
import {
  LayoutDashboard,
  Sparkles,
  FolderHeart,
  Users,
  Clapperboard,
  Library,
  Settings,
  CreditCard,
  LogOut,
  Bell,
  Radar,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import type { ActivityEventType } from "../../lib/activityMapping";
import type { Creator, CreatorPackage } from "../../types";
import { canViewBilling } from "../../lib/permissions";
import { TestAccountButton } from "./TestAccountButton";

// The bell is for things worth interrupting the client for — not a mirror of
// every log line (that full trail lives in Dashboard/Collection history).
const NOTABLE_EVENT_TYPES: ActivityEventType[] = [
  "submission_created",
  "regeneration_requested",
  "delivery_eta_set",
  "submission_finished",
  "submission_check_inbox",
];

// Read state is a per-browser affordance (localStorage), not a synced backend
// concept — matches the single-workspace-per-browser assumption elsewhere.
const LAST_READ_KEY = "reelforge_notifications_last_read_at";

export type Page =
  | "dashboard"
  | "hub"
  | "research"
  | "collections"
  | "creators"
  | "production"
  | "library"
  | "billing"
  | "settings"
  | "admin"
  | "syd";

// Same real routes as before, just one flat list now instead of three
// labelled groups — a presentation-only change (see the Executive Black
// pass) to match the reference's simpler, denser nav composition. No new
// items, no reordering of what each id navigates to.
const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={13} strokeWidth={1.75} /> },
  { id: "hub", label: "Creativity Hub", icon: <Sparkles size={13} strokeWidth={1.75} /> },
  { id: "research", label: "Research Accounts", icon: <Radar size={13} strokeWidth={1.75} /> },
  { id: "collections", label: "Collections", icon: <FolderHeart size={13} strokeWidth={1.75} /> },
  { id: "production", label: "Production", icon: <Clapperboard size={13} strokeWidth={1.75} /> },
  { id: "library", label: "Library", icon: <Library size={13} strokeWidth={1.75} /> },
  { id: "creators", label: "Creators", icon: <Users size={13} strokeWidth={1.75} /> },
  { id: "billing", label: "Billing", icon: <CreditCard size={13} strokeWidth={1.75} /> },
  { id: "settings", label: "Settings", icon: <Settings size={13} strokeWidth={1.75} /> },
];

export function Sidebar({
  page,
  onNavigate,
  userEmail,
  displayName,
  workspaceName,
  workspaceId,
  role,
  isPlatformAdmin,
  hasSydAccess,
  onSignOut,
  activity,
  onOpenCollection,
  creators,
  creatorPackages,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  userEmail?: string;
  displayName?: string;
  workspaceName?: string;
  workspaceId?: string;
  role?: string;
  // Completely separate from `role` — a normal Agency Owner never sees
  // this just because role === "owner" in their own workspace. Only true
  // for an account in client_os.platform_admins (see useAdminAccess).
  isPlatformAdmin?: boolean;
  // Also completely separate — backed by client_os.syd_members, unrelated
  // to platform_admins or workspace role (see useSydAccess). True for the
  // Owner and for any normal team member granted Sydney access at invite
  // time; only gates whether the nav entry shows, not what's inside it.
  hasSydAccess?: boolean;
  onSignOut?: () => void;
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenCollection: (collectionId: string) => void;
  // Real workspace plan data for the bottom-of-sidebar plan card — no single
  // per-workspace "plan" concept exists (ReelForge sells per-creator plans),
  // so the card shows the real "X of Y creators on an active plan" figure
  // instead of a fabricated plan name/renewal date.
  creators: Creator[];
  creatorPackages: Map<string, CreatorPackage>;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(() => Number(localStorage.getItem(LAST_READ_KEY) ?? 0));
  const shownName = displayName || userEmail;
  const initials = shownName ? shownName.slice(0, 2).toUpperCase() : "EM";
  const notifications = activity.items.filter((item) => NOTABLE_EVENT_TYPES.includes(item.eventType));
  const unread = notifications.length > 0 && new Date(notifications[0].createdAtRaw).getTime() > lastReadAt;
  // Real field already passed in (workspace.role) — shown under the name the
  // same way the reference shows "Owner" under "Noah", instead of always
  // falling back to email.
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : userEmail;
  const creatorsWithPlan = creators.filter((c) => creatorPackages.has(c.id)).length;

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(LAST_READ_KEY, String(now));
    setLastReadAt(now);
  }

  return (
    <aside
      className="relative z-20 w-[216px] shrink-0 h-full border-r border-[#0e0e10] bg-[#020203] flex flex-col"
      style={{ boxShadow: "inset -14px 0 22px -20px rgba(0,0,0,0.85), inset 0 1px 0 rgba(0,0,0,0.6)" }}
    >
      <div className="flex items-center justify-between gap-1.5 pt-[26px] pb-[24px] pl-[22px] pr-[14px]">
        <div className="flex items-center gap-[10px] min-w-0">
          <img src="/rf-logo-lockup.svg" alt="" className="w-[26px] h-[20px] shrink-0" />
          <span className="font-mn font-extralight text-[16px] tracking-[1.6px] text-[#ede5d6] uppercase truncate">ReelForge</span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="press-feedback relative w-[28px] h-[28px] rounded-[9px] border border-[#202024] bg-[#111114] flex items-center justify-center text-neutral-500 hover:text-neutral-50 transition-colors duration-150"
            >
              <Bell size={12} strokeWidth={1.75} />
              {unread && (
                <span
                  className="pulse-live absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#D39448]"
                  style={{ ["--pulse-live-color" as string]: "rgba(211,148,72,0.55)" }}
                />
              )}
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
                      <p className="text-[12px] text-neutral-50 leading-snug">{item.message}</p>
                      <p className="text-[10.5px] text-neutral-600 mt-0.5">{item.relativeTime}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-[4px] px-[14px] overflow-y-auto">
        {NAV_ITEMS.filter((item) => item.id !== "billing" || canViewBilling(role)).map((item) => {
          const active = item.id === page;
          return (
            <button
              key={item.id}
              onClick={() => {
                setNotifOpen(false);
                onNavigate(item.id);
              }}
              className={[
                "press-feedback relative w-full flex items-center gap-[12px] px-[13px] py-[11px] rounded-[9px] text-[11.5px] border transition-colors duration-150",
                active
                  ? "border-[#141009] text-[#f0c58c]"
                  : "border-transparent text-[#e2dbcd] hover:text-neutral-50 hover:bg-white/[0.03]",
              ].join(" ")}
              style={active ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
            >
              {active && (
                <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full bg-[#D39448]" style={{ boxShadow: "0 0 6px rgba(211,148,72,0.6)" }} />
              )}
              <span
                className="shrink-0 opacity-85"
                style={active ? { filter: "drop-shadow(0 0 2px #D3944880)" } : undefined}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-[14px]">
        {isPlatformAdmin && (
          <button
            onClick={() => onNavigate("admin")}
            className={[
              "relative mb-[4px] w-full flex items-center gap-[12px] px-[13px] py-[11px] rounded-[8px] text-[10px] border transition-colors duration-150",
              page === "admin"
                ? "border-[#141009] text-[#f0c58c]"
                : "border-transparent text-[#e2dbcd] hover:text-neutral-50 hover:bg-white/[0.03]",
            ].join(" ")}
            style={page === "admin" ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
          >
            {page === "admin" && (
              <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full bg-[#D39448]" style={{ boxShadow: "0 0 6px rgba(211,148,72,0.6)" }} />
            )}
            <ShieldCheck size={11} className="shrink-0 opacity-85" />
            Admin Dashboard
          </button>
        )}
        {hasSydAccess && (
          <button
            onClick={() => onNavigate("syd")}
            className={[
              "relative mb-[4px] w-full flex items-center gap-[12px] px-[13px] py-[11px] rounded-[8px] text-[10px] border transition-colors duration-150",
              page === "syd"
                ? "border-[#141009] text-[#f0c58c]"
                : "border-transparent text-[#e2dbcd] hover:text-neutral-50 hover:bg-white/[0.03]",
            ].join(" ")}
            style={page === "syd" ? { background: "linear-gradient(90deg, #2a1e11, #1a1510)" } : undefined}
          >
            {page === "syd" && (
              <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full bg-[#D39448]" style={{ boxShadow: "0 0 6px rgba(211,148,72,0.6)" }} />
            )}
            <ShieldCheck size={11} className="shrink-0 opacity-85" />
            Sydney Studio
          </button>
        )}
        <div className="group flex items-center gap-[10px] border-t border-[#131316] pt-[10px] pb-[11px] px-[6px]">
          <div className="w-[32px] h-[32px] rounded-[16px] bg-gradient-to-br from-[#D39448] to-[#A97942] flex items-center justify-center text-[10px] font-medium text-[#020508] shrink-0">
            {initials}
          </div>
          <div className="flex flex-col gap-[4px] leading-tight min-w-0">
            <span className="text-[11px] text-[#e7e2d8] truncate">{displayName || workspaceName || "Client workspace"}</span>
            <span className="text-[9.5px] text-[#948d82] truncate">{roleLabel ?? "Emre"}</span>
          </div>
          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <TestAccountButton workspaceId={workspaceId} canManage={Boolean(isPlatformAdmin)} />
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                title="Sign out"
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-neutral-50 hover:bg-white/[0.06] transition-all duration-150"
              >
                <LogOut size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Plan card — same premium bottom-of-sidebar placement/treatment as
            the reference's "PRO PLAN" card, but showing the real workspace
            figure (creators on an active plan) since ReelForge sells plans
            per creator, not as one workspace-wide subscription with a single
            renewal date to display. */}
        {creators.length > 0 && (
          <div className="mt-[10px] rounded-[10px] border border-[#202024] bg-[#111114] overflow-hidden">
            <div className="px-[13px] pt-[12px] pb-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-[9px] tracking-[1px] text-[#c8c2b6]">WORKSPACE PLAN</span>
                <span className={["text-[9px]", creatorsWithPlan > 0 ? "text-[#63c07f]" : "text-[#878278]"].join(" ")}>
                  {creatorsWithPlan > 0 ? "Active" : "None"}
                </span>
              </div>
              <p className="mt-[6px] text-[9.5px] text-[#888278]">
                <span className="text-[#cfc8bc] font-medium tabular-nums">{creatorsWithPlan}</span> / {creators.length} creators on a plan
              </p>
            </div>
            <button
              onClick={() => onNavigate("billing")}
              className="flex w-full items-center justify-between border-t border-[#202024] bg-[#0c0c0f] px-[13px] py-[10px] text-[10.5px] text-[#d6d0c5] hover:bg-[#101013] transition-colors duration-150"
            >
              Manage Plan
              <ChevronRight size={12} className="opacity-60" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
