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
  Radar,
  ShieldCheck,
  Building2,
  UserCog,
  ChevronRight,
} from "lucide-react";
import type { Creator, CreatorPackage } from "../../types";
import { canViewBilling } from "../../lib/permissions";
import { TestAccountButton } from "./TestAccountButton";

export type Page =
  | "dashboard"
  | "hub"
  | "research"
  | "collections"
  | "creators"
  | "team"
  | "production"
  | "library"
  | "billing"
  | "settings"
  | "admin"
  | "syd";

// Die Navigation nach Emres Vorlage vom 12.10.2026: dieselben Routen wie
// vorher, nur in vier benannte Gruppen gelegt. Keine neuen Eintraege,
// keine andere Reihenfolge innerhalb einer Gruppe, keine geaenderte
// Zielseite -- rein die Darstellung.
//
// Admin Dashboard und Sydney Studio stehen jetzt mit in der Gruppe
// SYSTEM, statt einzeln unten zu haengen. Wer sie sehen darf, entscheidet
// unveraendert `sichtbar` weiter unten (isPlatformAdmin bzw. hasSydAccess)
// -- die Gruppierung aendert daran nichts.
type NavEintrag = {
  id: Page;
  label: string;
  icon: React.ReactNode;
  // Fehlt das Feld, ist der Eintrag immer sichtbar.
  sichtbar?: (b: { role?: string; isPlatformAdmin?: boolean; hasSydAccess?: boolean }) => boolean;
};

const ICON = { size: 15, strokeWidth: 1.6 } as const;

const NAV_GRUPPEN: { label: string; items: NavEintrag[] }[] = [
  {
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard {...ICON} /> },
      { id: "hub", label: "Creativity Hub", icon: <Sparkles {...ICON} /> },
      { id: "research", label: "Research Accounts", icon: <Radar {...ICON} /> },
    ],
  },
  {
    label: "Workflow",
    items: [
      { id: "collections", label: "Collections", icon: <FolderHeart {...ICON} /> },
      { id: "production", label: "Production", icon: <Clapperboard {...ICON} /> },
      { id: "library", label: "Library", icon: <Library {...ICON} /> },
    ],
  },
  {
    label: "Organization",
    items: [
      { id: "creators", label: "Creators", icon: <Users {...ICON} /> },
      { id: "team", label: "Team", icon: <UserCog {...ICON} /> },
      { id: "billing", label: "Billing", icon: <CreditCard {...ICON} />, sichtbar: (b) => canViewBilling(b.role) },
    ],
  },
  {
    label: "System",
    items: [{ id: "settings", label: "Settings", icon: <Settings {...ICON} /> }],
  },
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
  // Real workspace plan data for the bottom-of-sidebar plan card — no single
  // per-workspace "plan" concept exists (ReelForge sells per-creator plans),
  // so the card shows the real "X of Y creators on an active plan" figure
  // instead of a fabricated plan name/renewal date.
  creators: Creator[];
  creatorPackages: Map<string, CreatorPackage>;
}) {
  const shownName = displayName || userEmail;
  const initials = shownName ? shownName.slice(0, 2).toUpperCase() : "EM";
  // Real field already passed in (workspace.role) — shown under the name the
  // same way the reference shows "Owner" under "Noah", instead of always
  // falling back to email.
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : userEmail;

  return (
    <aside
      className="relative z-20 w-[223px] shrink-0 h-full border-r border-[#111113] bg-[#030304] flex flex-col"
      style={{ boxShadow: "inset -14px 0 22px -20px rgba(0,0,0,0.85), inset 0 1px 0 rgba(0,0,0,0.6)" }}
    >
      <span className="rf-kante" aria-hidden="true" />

      {/* Die Glocke stand hier bis zum 14.10.2026. Sie sitzt jetzt oben
          rechts im Dashboard, wo ohnehin schon eine war -- siehe
          shared/Benachrichtigungen. Das Zeichen und der Schriftzug nehmen
          den frei gewordenen Platz auf. */}
      <div className="flex items-center justify-center gap-[10px] px-[16px] pt-[25px] pb-[17px]">
        <img src="/rf-logo-lockup.svg" alt="" className="h-[23px] w-[30px] shrink-0" />
        <span className="font-mn truncate text-[17.5px] font-extralight uppercase tracking-[2.1px] text-[#ede5d6]">
          ReelForge
        </span>
      </div>

      {/* Die Gruppen stehen oben in ihrem natuerlichen Abstand. Unser
          Fenster ist hoeher als die Vorlage -- die Luecke darunter bleibt
          bewusst stehen, statt die Zeilen auseinanderzuziehen (Emre,
          12.10.2026). Der Nutzerbereich haengt dafuer unten fest. */}
      <nav className="flex-1 min-h-0 flex flex-col px-[12px] pb-[6px]">
        {NAV_GRUPPEN.map((gruppe, i) => {
          const sichtbare = gruppe.items.filter((item) => !item.sichtbar || item.sichtbar({ role, isPlatformAdmin, hasSydAccess }));
          // Eine Gruppe, aus der alles weggefiltert wurde, hinterlaesst
          // weder Beschriftung noch Trennlinie.
          if (!sichtbare.length) return null;
          return (
            <div key={gruppe.label}>
              {i > 0 && <div className="mx-[8px] my-[13px] border-t border-[#161619]" />}
              <p className="px-[13px] pb-[8px] text-[9px] font-medium uppercase tracking-[1.8px] text-[#6e6a64]">
                {gruppe.label}
              </p>
              <div className="flex flex-col gap-[2px]">
                {sichtbare.map((item) => {
                  const active = item.id === page;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={[
                        "press-feedback relative w-full flex items-center gap-[12px] h-[37px] pl-[13px] pr-[10px] rounded-[9px] text-[12px] border transition-colors duration-150",
                        active
                          ? "border-[#3a2a17] text-[#eab97c]"
                          : "border-transparent text-[#dcd7ce] hover:text-neutral-50 hover:bg-white/[0.035]",
                      ].join(" ")}
                      style={
                        active
                          ? {
                              background: "linear-gradient(90deg, #271c10, #16110c)",
                              boxShadow: "0 0 14px -4px rgba(211,148,72,0.28)",
                            }
                          : undefined
                      }
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-full bg-[#D39448]"
                          style={{ boxShadow: "0 0 7px rgba(211,148,72,0.65)" }}
                        />
                      )}
                      <span className={active ? "shrink-0 text-[#EAC088]" : "shrink-0 text-[#b9b4ab]"}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      {active && <ChevronRight size={14} strokeWidth={1.6} className="ml-auto shrink-0 text-[#D39448]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Unten, direkt ueber dem Namen: Admin Dashboard und Sydney Studio
          ausgeschrieben, in derselben Machart wie die Eintraege oben
          (Emre, 12.10.2026). Sie stehen bewusst hier statt in der Gruppe
          SYSTEM -- oben bleibt es dadurch ruhig.

          Wer sie sieht, entscheiden dieselben beiden Bedingungen wie
          vorher; an Zielen und Berechtigungen aendert sich nichts. */}
      <div className="px-[12px] pb-[14px]">
        {(isPlatformAdmin || hasSydAccess) && (
          <div className="flex flex-col gap-[2px] pb-[10px]">
            {isPlatformAdmin && (
              <button
                onClick={() => onNavigate("admin")}
                className={[
                  "press-feedback relative w-full flex items-center gap-[12px] h-[37px] pl-[13px] pr-[10px] rounded-[9px] text-[12px] border transition-colors duration-150",
                  page === "admin"
                    ? "border-[#3a2a17] text-[#eab97c]"
                    : "border-transparent text-[#dcd7ce] hover:text-neutral-50 hover:bg-white/[0.035]",
                ].join(" ")}
                style={
                  page === "admin"
                    ? { background: "linear-gradient(90deg, #271c10, #16110c)", boxShadow: "0 0 14px -4px rgba(211,148,72,0.28)" }
                    : undefined
                }
              >
                {page === "admin" && (
                  <span
                    className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-full bg-[#D39448]"
                    style={{ boxShadow: "0 0 7px rgba(211,148,72,0.65)" }}
                  />
                )}
                <span className={page === "admin" ? "shrink-0 text-[#EAC088]" : "shrink-0 text-[#b9b4ab]"}>
                  <ShieldCheck {...ICON} />
                </span>
                <span className="truncate">Admin Dashboard</span>
                {page === "admin" && <ChevronRight size={14} strokeWidth={1.6} className="ml-auto shrink-0 text-[#D39448]" />}
              </button>
            )}
            {hasSydAccess && (
              <button
                onClick={() => onNavigate("syd")}
                className={[
                  "press-feedback relative w-full flex items-center gap-[12px] h-[37px] pl-[13px] pr-[10px] rounded-[9px] text-[12px] border transition-colors duration-150",
                  page === "syd"
                    ? "border-[#3a2a17] text-[#eab97c]"
                    : "border-transparent text-[#dcd7ce] hover:text-neutral-50 hover:bg-white/[0.035]",
                ].join(" ")}
                style={
                  page === "syd"
                    ? { background: "linear-gradient(90deg, #271c10, #16110c)", boxShadow: "0 0 14px -4px rgba(211,148,72,0.28)" }
                    : undefined
                }
              >
                {page === "syd" && (
                  <span
                    className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-full bg-[#D39448]"
                    style={{ boxShadow: "0 0 7px rgba(211,148,72,0.65)" }}
                  />
                )}
                <span className={page === "syd" ? "shrink-0 text-[#EAC088]" : "shrink-0 text-[#b9b4ab]"}>
                  <Building2 {...ICON} />
                </span>
                <span className="truncate">Sydney Studio</span>
                {page === "syd" && <ChevronRight size={14} strokeWidth={1.6} className="ml-auto shrink-0 text-[#D39448]" />}
              </button>
            )}
          </div>
        )}

        <div className="group flex items-center gap-[10px] border-t border-[#161619] pt-[11px] pb-[2px] px-[6px]">
          <div className="w-[32px] h-[32px] rounded-full bg-gradient-to-br from-[#EAC088] to-[#C08A45] flex items-center justify-center text-[10px] font-medium text-[#1a1208] shrink-0">
            {initials}
          </div>
          <div className="flex flex-col gap-[2px] leading-tight min-w-0">
            <span className="text-[11.5px] text-[#e7e2d8] truncate">{displayName || workspaceName || "Client workspace"}</span>
            <span className="text-[10px] text-[#8b857b] truncate">{roleLabel ?? "Emre"}</span>
          </div>
          {/* Die Testflasche sitzt seit dem 12.10.2026 direkt neben dem
              Namen und ist dauerhaft sichtbar, statt am rechten Rand zu
              haengen und erst beim Darueberfahren zu erscheinen (Emre).
              Sie erscheint ohnehin nur fuer Plattform-Admins. */}
          <div className="shrink-0">
            <TestAccountButton workspaceId={workspaceId} canManage={Boolean(isPlatformAdmin)} />
          </div>
          {/* Das Abmelden blendet ueber die Deckkraft ein und aus, nie
              ueber display -- sonst springt die Zeile. */}
          <div className="ml-auto flex items-center gap-[2px] shrink-0">
            {onSignOut && (
              <button
                onClick={onSignOut}
                title="Sign out"
                className="shrink-0 w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-[#6e6a64] opacity-0 group-hover:opacity-100 hover:text-neutral-50 hover:bg-white/[0.06] transition-all duration-150"
              >
                <LogOut size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
