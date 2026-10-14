import { useMemo, useState } from "react";
import {
  Activity as AktivZeichen,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleDot,
  Clock,
  Copy,
  Crown,
  KeyRound,
  Link2,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Settings as Zahnrad,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { KOPF_KUERZEL, KOPF_RAHMEN, KOPF_TITEL, KOPF_UNTERZEILE } from "../../lib/pageHeader";
import {
  Auftritt,
  ZeichenFeld,
  V3_KACHEL as KACHEL,
  V3_KACHEL_STIL as KACHEL_STIL,
  AbschnittKopf,
  V3_KARTE as KARTE,
  V3_KARTE_STIL as KARTE_STIL,
  Zahl,
} from "../shared/v3";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABEL,
  canChangeTeamRoles,
  canManageTeam,
  type WorkspaceRole,
} from "../../lib/permissions";
import { useTeamMembers, MAX_ADDITIONAL_MEMBERS, type TeamMember } from "../../state/useTeamMembers";
import { supabase } from "../../lib/supabase";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import {
  FARBE,
  Namenszeichen,
  Plakette,
  RollenPlakette,
  ROLLE_WAS_DARF,
  ROLLE_ZEICHEN,
  AvatarStapel,
  StatusPunkt,
  vorZeit,
  zugriff,
} from "./teamBausteine";

// =====================================================================
// Der Team-Bereich (12.10.2026, nach Emres Screenshot und der
// Figma-Datei; Screenshot war das visuelle Ziel, Figma lieferte Masse:
// Tabellenkopf 38, Zeilen 58, Detailspalte 343, Reiterleiste 42).
//
// WAS ECHT IST UND WAS NICHT -- bitte vor dem naechsten Umbau lesen:
//
//   ECHT   Mitglieder, Rollen (owner/manager/va), offene Einladungen,
//          das Plan-Recht je Manager, Rolle aendern, entfernen,
//          Einladung zuruecknehmen. Alles davon haengt an denselben
//          RPCs und Rechtepruefungen wie vorher; serverseitig wird
//          jede Aenderung noch einmal geprueft.
//
//   NICHT  "Assigned Creators", "Last Active" und eine Team-Chronik
//          gibt es in diesem Produkt nicht. Die Vorlage zeigt sie,
//          die Datenbank fuehrt sie nicht. Erfunden wird hier nichts:
//          wo nichts steht, steht ein Strich oder ein Satz, der sagt
//          warum. Ebenso die Rollen -- die Vorlage zeigt fuenf, es
//          gibt drei.
// =====================================================================

type Reiter = "members" | "creator-access" | "roles" | "invites" | "activity";

const REITER: { id: Reiter; label: string; icon: typeof Users }[] = [
  { id: "members", label: "Members", icon: Users },
  { id: "creator-access", label: "Creator Access", icon: Link2 },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "invites", label: "Invites", icon: Mail },
  { id: "activity", label: "Activity", icon: Clock },
];

export function TeamPage({
  workspaceId,
  userId,
  role,
  creators,
}: {
  workspaceId: string;
  userId: string;
  role?: string;
  /** Die echten Creator des Arbeitsbereichs. Jedes Mitglied arbeitet auf
   *  dem ganzen Bestand -- der Avatar-Stapel in der Tabelle zeigt also
   *  wirklich, worauf jemand Zugriff hat, und ist keine Attrappe. */
  creators: { id: string; name: string; profileImage?: string; avatarColor?: string }[];
}) {
  const creatorBilder = useMemo(
    // profileImage ist das echte Bildfeld des Creators; avatarColor faerbt
    // den Ersatzkreis so, wie ihn die Creators-Seite auch faerbt.
    () => creators.map((c) => ({ id: c.id, name: c.name, bild: c.profileImage ?? null, farbe: c.avatarColor })),
    [creators]
  );
  const {
    members,
    invites,
    loading,
    error,
    atMax,
    inviteMember,
    changeRole,
    removeMember,
    cancelInvite,
    updatePlanPermission,
  } = useTeamMembers(workspaceId);

  const [reiter, setReiter] = useState<Reiter>("members");
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [einladenOffen, setEinladenOffen] = useState(false);
  const [filterOffen, setFilterOffen] = useState(false);
  const [rollenFilter, setRollenFilter] = useState<"alle" | WorkspaceRole>("alle");
  const [haken, setHaken] = useState<Set<string>>(new Set());

  const darfVerwalten = canManageTeam(role);
  const darfRollen = canChangeTeamRoles(role);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return members.filter((m) => {
      if (rollenFilter !== "alle" && m.role !== rollenFilter) return false;
      if (!q) return true;
      return (m.displayName ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
    });
  }, [members, suche, rollenFilter]);

  const alleGewaehlt = gefiltert.length > 0 && gefiltert.every((m) => haken.has(m.id));
  function alleUmschalten() {
    setHaken(alleGewaehlt ? new Set() : new Set(gefiltert.map((m) => m.id)));
  }
  function hakenUmschalten(id: string) {
    setHaken((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  const detail = members.find((m) => m.id === gewaehlt) ?? null;
  const rollenZahl = new Set(members.map((m) => m.role)).size;

  return (
    <div className="relative">
      {/* Derselbe Sternenhimmel und derselbe warme Schein wie oben auf
          Billing -- ohne sie wirkte der Kopfbereich leer im Vergleich
          (Emre, 13.10.2026). Werte eins zu eins von dort. */}
      <style>{`
        .rf-team-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-team-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>
      <div className="dashboard-starfield-boost rf-team-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
        <StarfieldBackground starCount={52} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px]"
        style={{
          background:
            "radial-gradient(115% 150% at 68% 0%, rgba(211,148,72,0.042) 0%, rgba(211,148,72,0.014) 40%, rgba(0,0,0,0) 74%)",
        }}
      />
    <Auftritt className={["relative", KOPF_RAHMEN].join(" ")}>
      {/* ---------------- Kopf ---------------- */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <span className={KOPF_KUERZEL}>Organization</span>
          <h1 className={KOPF_TITEL}>Team</h1>
          <p className={[KOPF_UNTERZEILE, "text-[#8c877e] max-w-3xl"].join(" ")}>
            Manage your team, roles, access and creator assignments. Keep your agency organized and in control.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[9px] pt-[8px]">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-[#8c877e]" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Search members..."
              className="h-[33px] w-[222px] rounded-[6px] border border-[#26262b] bg-[#17171a] pl-[33px] pr-[12px] text-[11px] text-[#f2f0ef] outline-none placeholder:text-[#8c877e] focus:border-[#D39448]/45"
              style={KACHEL_STIL}
            />
          </div>
          {darfVerwalten && (
            <button
              onClick={() => setEinladenOffen(true)}
              className="h-[33px] rounded-[6px] border border-[#D39448] bg-[linear-gradient(113.9deg,#EAC088_0%,#D39448_100%)] px-[14px] text-[11px] font-semibold text-[#020508] shadow-[inset_0px_1px_3px_0px_rgba(255,236,206,0.3),0_0_18px_rgba(211,148,72,0.28)] transition-[filter,box-shadow] duration-150 hover:brightness-[1.06] hover:shadow-[0_0_22px_rgba(211,148,72,0.38)] inline-flex items-center justify-center gap-1.5"
            >
              <Plus size={13} strokeWidth={2.4} />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Reiter ---------------- */}
      <div
        className={[KACHEL, "mt-[20px] inline-flex h-[40px] items-center gap-[2px] p-[4px]"].join(" ")}
        style={KACHEL_STIL}
      >
        {REITER.map((r) => {
          const aktiv = r.id === reiter;
          const Zeichen = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => setReiter(r.id)}
              className={[
                "flex h-[32px] items-center gap-[7px] rounded-[6px] px-[13px] text-[11.5px] transition-colors duration-150",
                aktiv ? "text-[#EAC088]" : "text-[#8c877e] hover:text-[#f2f0ef]",
              ].join(" ")}
              style={
                aktiv
                  ? { background: "rgba(211,148,72,0.12)", border: "1px solid rgba(211,148,72,0.38)" }
                  : { border: "1px solid transparent" }
              }
            >
              <Zeichen size={13} strokeWidth={1.8} />
              {r.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-[9px] border border-[#3a211d] bg-[#1a0f0e] px-[14px] py-[10px] text-[12px] text-[#e0664f]">
          {error}
        </p>
      )}

      {reiter === "members" && (
        <>
          {/* Die Detailspalte steht im Screenshot NEBEN allem -- Kacheln,
              Tabelle und den unteren Kaesten -- und reicht ueber die ganze
              Hoehe. Deshalb liegt hier eine linke Spalte um alles drei. */}
          <div className="mt-[16px] flex items-start gap-[13px]">
            <div className="flex min-w-0 flex-1 flex-col gap-[13px]">

          {/* ---------------- Kennzahlen ---------------- */}
          <div className="grid grid-cols-4 gap-[13px]">
            <Kennzahl
              icon={UsersRound}
              wert={members.length}
              label="Total Members"
              unter={`${MAX_ADDITIONAL_MEMBERS} besides the Owner`}
            />
            <Kennzahl icon={CircleDot} wert={members.length} label="Active Members" unter="Signed up and working" />
            <Kennzahl
              icon={Clock}
              wert={invites.length}
              label={invites.length === 1 ? "Pending Invite" : "Pending Invites"}
              unter={invites.length ? "Waiting to be accepted" : "Nothing outstanding"}
            />
            <Kennzahl
              icon={Shield}
              wert={rollenZahl}
              label="Roles"
              unter="Owner, Manager, VA"
              pfeil
              onClick={() => setReiter("roles")}
            />
          </div>

          {/* ---------------- Tabelle ---------------- */}
            <div className={KARTE} style={KARTE_STIL}>
              <div className="flex items-start justify-between gap-4 px-[18px] pt-[16px] pb-[13px]">
                {/* Derselbe Abschnittskopf wie in Billing: goldenes
                    Zeichenquadrat mit Schein, Titel, Unterzeile. Das war
                    der groesste fehlende Baustein (Emre, 13.10.2026). */}
                <AbschnittKopf
                  icon={UsersRound}
                  titel="Team Members"
                  unterzeile="Manage your team, assign roles and control access to creators and features."
                />
                {/* Im Screenshot sitzt hier ein Filter-Knopf. Er filtert
                    nach Rolle -- das ist die einzige Eigenschaft, nach der
                    sich bei drei Rollen sinnvoll filtern laesst. */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setFilterOffen((v) => !v)}
                    className="inline-flex h-[33px] items-center justify-center gap-[7px] rounded-[6px] border border-[#26262b] bg-[#17171a] px-[15px] text-[11px] text-[#f2f0ef] hover:border-[#3a3a40] transition-colors duration-150"
                    style={{ background: "#17171a", borderColor: "#26262b" }}
                  >
                    <SlidersHorizontal size={13} strokeWidth={1.8} />
                    Filter
                    {rollenFilter !== "alle" && <span className="h-[5px] w-[5px] rounded-full bg-[#D39448]" />}
                  </button>
                  {filterOffen && (
                    <div
                      onMouseLeave={() => setFilterOffen(false)}
                      className="absolute right-0 top-[42px] z-40 w-[164px] rounded-[9px] border border-[#26262b] p-[5px] shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
                      style={{ background: "#17171a", borderColor: "#26262b" }}
                    >
                      {(["alle", "owner", "manager", "va"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setRollenFilter(r);
                            setFilterOffen(false);
                          }}
                          className={[
                            "w-full rounded-[6px] px-[9px] py-[7px] text-left text-[11.5px] hover:bg-white/[0.05]",
                            rollenFilter === r ? "text-[#e8b87a]" : "text-[#c5cad3]",
                          ].join(" ")}
                        >
                          {r === "alle" ? "All roles" : ROLE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-[10px] pb-[12px]">
                {/* Die Spaltentitel stehen in der Vorlage in normaler
                    Schreibweise und deutlich groesser, nicht als kleine
                    Versalien. Und die Spalten sitzen enger beieinander --
                    Emres Befund "zu weit auseinander" (13.10.2026). */}
                <div className="grid h-[36px] grid-cols-[26px_minmax(0,1.7fr)_118px_150px_128px_118px_132px_52px] items-center gap-[8px] border-b border-[#1a130b] px-[12px] text-[11.5px] text-[#8c877e]">
                  <Kaestchen an={alleGewaehlt} onAendern={alleUmschalten} />
                  <span>Member</span>
                  <span>Role</span>
                  <span>Assigned Creators</span>
                  <span>Access</span>
                  <span>Status</span>
                  <span>Last Active</span>
                  <span className="text-right">Actions</span>
                </div>

                {loading && <p className="px-[12px] py-[18px] text-[12px] text-[#8b93a0]">Loading team…</p>}

                {!loading &&
                  gefiltert.map((m) => (
                    <Zeile
                      key={m.id}
                      m={m}
                      ichSelbst={m.userId === userId}
                      aktiv={m.id === gewaehlt}
                      angehakt={haken.has(m.id)}
                      onHaken={() => hakenUmschalten(m.id)}
                      creators={creatorBilder}
                      onOeffnen={() => setGewaehlt((v) => (v === m.id ? null : m.id))}
                      darfRollen={darfRollen}
                      darfVerwalten={darfVerwalten}
                      onRolle={(r) => void changeRole(m.id, r)}
                      onEntfernen={() => void removeMember(m.id)}
                    />
                  ))}

                {!loading &&
                  invites.map((e) => (
                    <div
                      key={e.id}
                      className="grid h-[58px] grid-cols-[26px_minmax(0,1.7fr)_118px_150px_128px_118px_132px_52px] items-center gap-[8px] border-b border-[#15100a] px-[12px]"
                    >
                      <span />
                      <span className="flex min-w-0 items-center gap-[10px]">
                        <Namenszeichen name={e.email} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] leading-[17px] font-medium text-[#f5f5f5]">{e.email.split("@")[0]}</span>
                          <span className="block truncate text-[11px] leading-[15px] text-[#8c877e]">{e.email}</span>
                        </span>
                      </span>
                      <span className="justify-self-start"><RollenPlakette rolle={e.role} /></span>
                      <AvatarStapel leute={creators} size={30} />
                      <span className="justify-self-start"><Plakette ton="grau" icon={CircleDashed}>Not yet</Plakette></span>
                      <span className="justify-self-start"><StatusPunkt ton="gold">Pending</StatusPunkt></span>
                      <span className="text-[12px] text-[#b8c0cb]">Invited {vorZeit(e.createdAt)}</span>
                      <span className="flex justify-end">
                        {darfVerwalten && (
                          <button
                            onClick={() => void cancelInvite(e.id)}
                            title="Cancel invite"
                            className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-[#8b93a0] hover:bg-white/[0.05] hover:text-[#e0664f] transition-colors duration-150"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}

                {!loading && gefiltert.length === 0 && invites.length === 0 && (
                  <p className="px-[12px] py-[22px] text-[11px] text-[#8c877e]">No members match that search.</p>
                )}
              </div>
            </div>

          {/* ---------------- Drei Kaesten unten ---------------- */}
          <div className="grid grid-cols-3 gap-[13px]">
            <div className={[KARTE, "p-[18px]"].join(" ")} style={KARTE_STIL}>
              <AbschnittKopf icon={Zap} titel="Quick Actions" unterzeile="Common team management tasks." />
              <div className="mt-[14px] flex flex-col gap-[7px]">
                <Schnellknopf
                  icon={UserPlus}
                  label="Invite Member"
                  unter="Send a join link by email"
                  onClick={() => setEinladenOffen(true)}
                  aus={!darfVerwalten}
                />
                <Schnellknopf
                  icon={Shield}
                  label="Manage Roles"
                  unter="See what each role may do"
                  onClick={() => setReiter("roles")}
                />
                <Schnellknopf
                  icon={Clock}
                  label="View Activity"
                  unter="What the team has been doing"
                  onClick={() => setReiter("activity")}
                />
              </div>
            </div>

            <div className={[KARTE, "p-[18px]"].join(" ")} style={KARTE_STIL}>
              <AbschnittKopf icon={Shield} titel="Team Roles" unterzeile={`${rollenZahl} roles in your workspace.`} />
              <div className="mt-[14px] flex flex-col gap-[11px]">
                {(["owner", "manager", "va"] as WorkspaceRole[]).map((r) => {
                  const n = members.filter((m) => m.role === r).length;
                  return (
                    <div key={r} className="flex items-center gap-[10px]">
                      {/* Dieselbe Pille wie in der Tabelle -- Billings
                          Machart mit Zeichen, Kante und Schein. */}
                      <RollenPlakette rolle={r} />
                      <span className="ml-auto text-[11px] text-[#8c877e]">
                        {n} member{n === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setReiter("roles")}
                className="mt-[14px] inline-flex items-center gap-[4px] text-[11px] text-[#D39448]/70 hover:text-[#EAC088] transition-colors duration-150"
              >
                View all roles <ArrowRight size={13} />
              </button>
            </div>

            <div className={[KARTE, "p-[18px]"].join(" ")} style={KARTE_STIL}>
              <AbschnittKopf icon={KeyRound} titel="Access Management" unterzeile="Control what your team can access." />
              <div className="mt-[14px] flex flex-col gap-[7px]">
                <Zugangszeile icon={Link2} titel="Creator Access" unter="Manage creator assignments" onClick={() => setReiter("creator-access")} />
                <Zugangszeile icon={Shield} titel="Feature Permissions" unter="Control feature access per role" onClick={() => setReiter("roles")} />
                <Zugangszeile icon={Zahnrad} titel="Workspace Settings" unter="Team and organization settings" onClick={() => setReiter("roles")} />
              </div>
            </div>
          </div>

            </div>

            {detail && (
              <Detailspalte
                m={detail}
                ichSelbst={detail.userId === userId}
                darfRollen={darfRollen}
                darfVerwalten={darfVerwalten}
                onSchliessen={() => setGewaehlt(null)}
                onRolle={(r) => void changeRole(detail.id, r)}
                onPlanRecht={(v) => void updatePlanPermission(detail.id, v)}
                onEntfernen={() => {
                  void removeMember(detail.id);
                  setGewaehlt(null);
                }}
              />
            )}
          </div>
        </>
      )}

      {reiter === "creator-access" && <CreatorZugriff />}
      {reiter === "roles" && <RollenUndRechte members={members} />}
      {reiter === "invites" && (
        <EinladungenReiter
          invites={invites}
          darfVerwalten={darfVerwalten}
          atMax={atMax}
          onZuruecknehmen={(id) => void cancelInvite(id)}
          onEinladen={() => setEinladenOffen(true)}
        />
      )}
      {reiter === "activity" && <AktivitaetReiter />}

      {einladenOffen && (
        <EinladenFenster
          atMax={atMax}
          onSchliessen={() => setEinladenOffen(false)}
          onSenden={inviteMember}
        />
      )}
    </Auftritt>
    </div>
  );
}

// ---------------------------------------------------------------------

/** Das Auswahlkaestchen links in der Tabelle -- im Screenshot ein
 *  kleines abgerundetes Quadrat mit feinem Rand. */
function Kaestchen({ an, onAendern }: { an: boolean; onAendern: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onAendern();
      }}
      className="flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border transition-colors duration-150"
      style={{
        borderColor: an ? "#D39448" : FARBE.randHell,
        background: an ? "#D39448" : "transparent",
      }}
    >
      {an && <Check size={11} strokeWidth={3} className="text-[#1d1409]" />}
    </button>
  );
}

function Kennzahl({
  icon,
  wert,
  label,
  unter,
  pfeil,
  onClick,
}: {
  icon: typeof Users;
  wert: number;
  label: string;
  /** Die dritte Zeile -- Billings Kacheln haben sie immer. */
  unter?: string;
  pfeil?: boolean;
  onClick?: () => void;
}) {
  const inhalt = (
    <>
      <ZeichenFeld icon={icon} size={40} rund glanz />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12px] leading-[16px] text-[#afb7c3]">{label}</span>
        <span className="mt-[2px] block text-[24px] font-bold leading-[29px] tabular-nums tracking-[-0.5px] text-[#f5f5f5]">
          <Zahl wert={wert} />
        </span>
        {unter && <span className="mt-[1px] block truncate text-[11px] leading-[15px] text-[#b9c0ca]">{unter}</span>}
      </span>
      {pfeil && <ChevronRight size={14} className="mt-[2px] shrink-0 text-[#8c877e]" />}
    </>
  );
  const klasse = [KACHEL, "flex items-start gap-[12px] px-[14px] py-[13px]"].join(" ");
  const stil = KACHEL_STIL;
  return onClick ? (
    <button onClick={onClick} className={[klasse, "text-left hover:border-[#2f2f35] transition-colors duration-150"].join(" ")} style={stil}>
      {inhalt}
    </button>
  ) : (
    <div className={klasse} style={stil}>
      {inhalt}
    </div>
  );
}

function Zeile({
  m,
  ichSelbst,
  aktiv,
  angehakt,
  onHaken,
  creators,
  onOeffnen,
  darfRollen,
  darfVerwalten,
  onRolle,
  onEntfernen,
}: {
  m: TeamMember;
  ichSelbst: boolean;
  aktiv: boolean;
  angehakt: boolean;
  onHaken: () => void;
  creators: { id: string; name: string; bild?: string | null; farbe?: string }[];
  onOeffnen: () => void;
  darfRollen: boolean;
  darfVerwalten: boolean;
  onRolle: (r: "manager" | "va") => void;
  onEntfernen: () => void;
}) {
  const [menue, setMenue] = useState(false);
  const z = zugriff(m.role, m.canChangePlan);
  const name = m.displayName || (m.email ?? "").split("@")[0] || "Member";

  return (
    <div
      onClick={onOeffnen}
      className="relative grid h-[58px] cursor-pointer grid-cols-[26px_minmax(0,1.7fr)_118px_150px_128px_118px_132px_52px] items-center gap-[8px] border-b px-[12px] transition-colors duration-150 hover:bg-white/[0.022]"
      style={{
        borderColor: "#15100a",
        ...(aktiv
          ? {
              background: "linear-gradient(90deg, rgba(211,148,72,0.075), rgba(211,148,72,0.02))",
              boxShadow: "inset 0 0 0 1px rgba(211,148,72,0.38)",
              borderRadius: 9,
            }
          : {}),
      }}
    >
      <Kaestchen an={angehakt} onAendern={onHaken} />

      <span className="flex min-w-0 items-center gap-[10px]">
        <Namenszeichen name={name} size={36} gold={m.role === "owner"} />
        <span className="min-w-0">
          <span className="flex items-center gap-[5px]">
            <span className="truncate text-[13px] leading-[17px] font-medium text-[#f5f5f5]">{name}</span>
            {/* Die Krone steht neben dem Namen, nicht in der Plakette --
                so steht es im Screenshot. */}
            {m.role === "owner" && <Crown size={12} className="shrink-0 text-[#e8b87a]" strokeWidth={2} />}
          </span>
          <span className="block truncate text-[11px] leading-[15px] text-[#8c877e]">{m.email ?? "—"}</span>
        </span>
      </span>

      <span className="justify-self-start"><RollenPlakette rolle={m.role} /></span>

      {/* Es gibt in diesem Produkt keine Zuordnung einzelner Creator zu
          einzelnen Mitgliedern -- jeder im Arbeitsbereich sieht alle.
          Deshalb steht hier bei allen dasselbe, statt eine Auswahl
          vorzutaeuschen. */}
      <AvatarStapel leute={creators} size={30} />

      <span className="justify-self-start"><Plakette ton={z.ton} icon={z.Zeichen}>{z.label}</Plakette></span>
      <span className="justify-self-start"><StatusPunkt ton="gruen">Active</StatusPunkt></span>

      {/* Wann jemand zuletzt da war, zeichnet dieses Produkt nicht auf. */}
      <span className="text-[12px] text-[#b8c0cb]">—</span>

      <span className="flex items-center justify-end gap-[6px]" onClick={(e) => e.stopPropagation()}>
        {darfVerwalten && m.role !== "owner" && (
          <span className="relative">
            <button
              onClick={() => setMenue((v) => !v)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[#9aa0aa] hover:bg-white/[0.06] hover:text-[#f2f0ef] transition-colors duration-150"
            >
              <MoreHorizontal size={17} />
            </button>
            {menue && (
              <div
                onMouseLeave={() => setMenue(false)}
                className="absolute right-0 top-[32px] z-40 w-[184px] rounded-[9px] border border-[#26262b] p-[5px] shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
                style={{ background: "#17171a", borderColor: "#26262b" }}
              >
                {darfRollen &&
                  ASSIGNABLE_ROLES.filter((r) => r !== m.role).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        onRolle(r);
                        setMenue(false);
                      }}
                      className="w-full rounded-[6px] px-[9px] py-[7px] text-left text-[11.5px] text-[#c5cad3] hover:bg-white/[0.05]"
                    >
                      Make {ROLE_LABEL[r]}
                    </button>
                  ))}
                {!ichSelbst && (
                  <button
                    onClick={() => {
                      onEntfernen();
                      setMenue(false);
                    }}
                    className="w-full rounded-[6px] px-[9px] py-[7px] text-left text-[11.5px] text-[#ff8a8a] hover:bg-white/[0.05]"
                  >
                    Remove from team
                  </button>
                )}
              </div>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function Detailspalte({
  m,
  ichSelbst,
  darfRollen,
  darfVerwalten,
  onSchliessen,
  onRolle,
  onPlanRecht,
  onEntfernen,
}: {
  m: TeamMember;
  ichSelbst: boolean;
  darfRollen: boolean;
  darfVerwalten: boolean;
  onSchliessen: () => void;
  onRolle: (r: "manager" | "va") => void;
  onPlanRecht: (v: boolean) => void;
  onEntfernen: () => void;
}) {
  const [unterReiter, setUnterReiter] = useState<"overview" | "access" | "creators" | "activity">("overview");
  const [kopiert, setKopiert] = useState(false);
  const [rolleOffen, setRolleOffen] = useState(false);
  const [mailLaeuft, setMailLaeuft] = useState(false);
  const [mailStand, setMailStand] = useState<"gesendet" | "fehler" | null>(null);
  const name = m.displayName || (m.email ?? "").split("@")[0] || "Member";
  const z = zugriff(m.role, m.canChangePlan);
  const RolleZ = ROLLE_ZEICHEN[m.role].Zeichen;

  return (
    <aside
      className={[KARTE, "w-[343px] shrink-0 p-[18px]"].join(" ")}
      style={KARTE_STIL}
    >
      <div className="flex items-start justify-between">
        <Namenszeichen name={name} size={54} gold={m.role === "owner"} />
        <button
          onClick={onSchliessen}
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-[#8c877e] hover:bg-white/[0.06] hover:text-[#f2f0ef] transition-colors duration-150"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-[11px] flex items-center gap-[6px]">
        <h3 className="text-[15px] font-semibold leading-[20px] tracking-[-0.1px] text-[#f5f5f5]">{name}</h3>
        {m.role === "owner" && <Crown size={13} className="shrink-0 text-[#EAC088]" strokeWidth={2} />}
      </div>
      <div className="mt-[6px]">
        <StatusPunkt ton="gruen">Active</StatusPunkt>
      </div>
      <p className="mt-[9px] text-[11.5px] leading-[16px] text-[#b9c0ca]">{m.email ?? "—"}</p>
      <p className="mt-[2px] text-[10.5px] leading-[14px] text-[#8c877e]">
        {ROLE_LABEL[m.role]}
        {m.joinedAt && ` • Joined ${new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        {ichSelbst && " • That's you"}
      </p>

      <div
        className={[KACHEL, "mt-[14px] grid grid-cols-4 gap-[2px] p-[3px]"].join(" ")}
        style={KACHEL_STIL}
      >
        {(["overview", "access", "creators", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setUnterReiter(t)}
            className={[
              "h-[28px] rounded-[5px] text-[11px] capitalize transition-colors duration-150",
              unterReiter === t ? "text-[#EAC088]" : "text-[#8c877e] hover:text-[#f2f0ef]",
            ].join(" ")}
            style={
              unterReiter === t
                ? { background: "rgba(211,148,72,0.12)", border: "1px solid rgba(211,148,72,0.38)" }
                : { border: "1px solid transparent" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {unterReiter === "overview" && (
        <div className="mt-[15px] flex flex-col gap-[13px]">
          <Feld label="Role">
            {/* Im Screenshot ist das ein Kasten mit Zeichen, Titel,
                Erklaerung und Pfeil -- kein nacktes Auswahlfeld. Das
                Aendern selbst bleibt Owner-Sache. */}
            <div className="relative">
              <button
                onClick={() => darfRollen && m.role !== "owner" && setRolleOffen((v) => !v)}
                disabled={!darfRollen || m.role === "owner"}
                className={[KACHEL, "flex w-full items-start gap-[10px] px-[12px] py-[10px] text-left transition-colors duration-150 enabled:hover:border-[#2f2113] disabled:cursor-default"].join(" ")}
                style={KACHEL_STIL}
              >
                <RolleZ size={13} strokeWidth={1.9} className="mt-[2px] shrink-0" style={{ color: ROLLE_ZEICHEN[m.role].farbe }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-[16px] text-[#f2f0ef]">{ROLE_LABEL[m.role]}</span>
                  <span className="block text-[10.5px] leading-[14px] text-[#8c877e]">{ROLLE_WAS_DARF[m.role]}</span>
                </span>
                {darfRollen && m.role !== "owner" && (
                  <ChevronDown size={13} className="mt-[2px] shrink-0 text-[#8c877e]" />
                )}
              </button>
              {rolleOffen && (
                <div
                  onMouseLeave={() => setRolleOffen(false)}
                  className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 rounded-[9px] border border-[#26262b] p-[5px] shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
                  style={{ background: "#17171a", borderColor: "#26262b" }}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        onRolle(r);
                        setRolleOffen(false);
                      }}
                      className={[
                        "w-full rounded-[6px] px-[9px] py-[7px] text-left text-[12px] hover:bg-white/[0.05]",
                        r === m.role ? "text-[#e8b87a]" : "text-[#c5cad3]",
                      ].join(" ")}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Feld>

          <Feld label="Status">
            <div
              className={[KACHEL, "flex h-[40px] items-center gap-[9px] px-[12px]"].join(" ")}
              style={KACHEL_STIL}
            >
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#63c07f] shadow-[0_0_6px_rgba(99,192,127,0.55)]" />
              <span className="flex-1 text-[12px] text-[#63c07f]">Active</span>
            </div>
          </Feld>

          <Feld label="Email">
            <div
              className={[KACHEL, "flex h-[40px] items-center gap-[9px] px-[12px]"].join(" ")}
              style={KACHEL_STIL}
            >
              <Mail size={13} className="shrink-0 text-[#8c877e]" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#b8c0cb]">{m.email ?? "—"}</span>
              <button
                onClick={() => {
                  if (m.email) void navigator.clipboard.writeText(m.email);
                  setKopiert(true);
                  window.setTimeout(() => setKopiert(false), 1500);
                }}
                className="shrink-0 text-[#6f757f] hover:text-[#f5f5f5] transition-colors duration-150"
                title="Copy email"
              >
                <Copy size={13} strokeWidth={1.8} />
              </button>
            </div>
            {kopiert && <p className="mt-[5px] text-[11px] text-[#6ee7a0]">Copied.</p>}
          </Feld>

          <Feld label="Last active">
            {/* Nicht aufgezeichnet -- siehe Kopf der Datei. */}
            <div
              className={[KACHEL, "flex h-[40px] items-center gap-[9px] px-[12px] text-[12px] text-[#8c877e]"].join(" ")}
              style={KACHEL_STIL}
            >
              <Clock size={13} strokeWidth={1.8} />
              Not tracked in ReelForge
            </div>
          </Feld>

          <div className="flex flex-col gap-[7px]">
            {/* Echt, nicht geschmueckt: das schickt dem Mitglied eine
                Mail zum Zuruecksetzen. Das Passwort selbst sieht und
                setzt hier niemand -- das geht nur ueber den Link in
                dieser Mail. */}
            <button
              onClick={async () => {
                if (!m.email) return;
                setMailLaeuft(true);
                const { error } = await supabase.auth.resetPasswordForEmail(m.email);
                setMailLaeuft(false);
                setMailStand(error ? "fehler" : "gesendet");
                window.setTimeout(() => setMailStand(null), 3000);
              }}
              disabled={!m.email || mailLaeuft}
              className={[KACHEL, "flex h-[40px] items-center gap-[10px] px-[12px] text-[12px] text-[#b8c0cb] transition-colors duration-150 enabled:hover:border-[#2f2113] disabled:opacity-50"].join(" ")}
              style={KACHEL_STIL}
            >
              <KeyRound size={14} strokeWidth={1.8} className="text-[#D39448]" />
              {mailLaeuft
                ? "Sending…"
                : mailStand === "gesendet"
                  ? "Reset email sent"
                  : mailStand === "fehler"
                    ? "Couldn't send — try again"
                    : "Reset password"}
            </button>

            {darfVerwalten && !ichSelbst && m.role !== "owner" && (
              <button
                onClick={onEntfernen}
                className="flex h-[40px] items-center gap-[10px] rounded-[9px] border px-[12px] text-[12px] text-[#ff8a8a] transition-colors duration-150 hover:bg-[rgba(255,138,138,0.08)]"
                style={{ background: "rgba(255,138,138,0.05)", borderColor: "rgba(255,138,138,0.24)" }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                Remove from team
              </button>
            )}
          </div>
        </div>
      )}

      {unterReiter === "access" && (
        <div className="mt-[15px] flex flex-col gap-[11px]">
          <Feld label="Effective access">
            <div className={[KACHEL, "px-[12px] py-[11px]"].join(" ")} style={KACHEL_STIL}>
              <Plakette ton={z.ton}>{z.label}</Plakette>
              <p className="mt-[8px] text-[11px] leading-[16px] text-[#8c877e]">{ROLLE_WAS_DARF[m.role]}</p>
            </div>
          </Feld>

          {m.role === "manager" && (
            <Feld label="Billing">
              <label
                className={[KACHEL, "flex cursor-pointer items-start gap-[10px] px-[12px] py-[11px]"].join(" ")}
                style={KACHEL_STIL}
              >
                <input
                  type="checkbox"
                  checked={m.canChangePlan}
                  disabled={!darfRollen}
                  onChange={(e) => onPlanRecht(e.target.checked)}
                  className="mt-[2px]"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] text-[#f2f0ef]">Can change plan</span>
                  <span className="block text-[10.5px] leading-[14px] text-[#8c877e]">
                    Only the Owner can grant this. Off by default for every Manager.
                  </span>
                </span>
              </label>
            </Feld>
          )}

          <Feld label="Workspace">
            <div
              className={[KACHEL, "px-[12px] py-[11px] text-[11px] leading-[16px] text-[#8c877e]"].join(" ")}
              style={KACHEL_STIL}
            >
              Every member sees all creators, collections and productions in this workspace. Access is controlled by
              role, not per creator.
            </div>
          </Feld>
        </div>
      )}

      {unterReiter === "creators" && (
        <div
          className={[KACHEL, "mt-[15px] px-[12px] py-[12px]"].join(" ")}
          style={KACHEL_STIL}
        >
          <p className="text-[12px] text-[#b8c0cb]">All creators</p>
          <p className="mt-[5px] text-[11px] leading-[16px] text-[#8c877e]">
            ReelForge doesn't assign creators to individual members — everyone in the workspace works on the whole
            roster. There is nothing to assign here.
          </p>
        </div>
      )}

      {unterReiter === "activity" && (
        <div
          className={[KACHEL, "mt-[15px] px-[12px] py-[12px]"].join(" ")}
          style={KACHEL_STIL}
        >
          <p className="text-[11px] leading-[16px] text-[#8c877e]">
            No per-member activity is recorded. The workspace activity feed on the Dashboard shows what happened, not
            who was online when.
          </p>
        </div>
      )}
    </aside>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-[6px] text-[11px] leading-[15px] text-[#afb7c3]">{label}</p>
      {children}
    </div>
  );
}

function Schnellknopf({
  icon: Zeichen,
  label,
  unter,
  onClick,
  aus,
}: {
  icon: typeof Users;
  label: string;
  unter: string;
  onClick: () => void;
  aus?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={aus}
      // Aufbau wie Billings Kacheln in "Workspace & Creator Access":
      // goldumrandetes Zeichenfeld, darueber die Beschriftung, darunter
      // die Erlaeuterung (Emre, 13.10.2026).
      className={[
        KACHEL,
        "flex items-center gap-[11px] px-[12px] py-[9px] text-left hover:border-[#2f2113] disabled:opacity-45 transition-colors duration-150",
      ].join(" ")}
      style={KACHEL_STIL}
    >
      <ZeichenFeld icon={Zeichen} size={30} radius={8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-[16px] text-[#f2f0ef]">{label}</span>
        <span className="block truncate text-[10.5px] leading-[14px] text-[#8c877e]">{unter}</span>
      </span>
      <ChevronRight size={13} className="shrink-0 text-[#8c877e]" />
    </button>
  );
}

function Zugangszeile({
  icon: Zeichen,
  titel,
  unter,
  onClick,
}: {
  icon: typeof Users;
  titel: string;
  unter: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[KACHEL, "flex items-center gap-[11px] px-[12px] py-[9px] text-left hover:border-[#2f2113] transition-colors duration-150"].join(" ")}
      style={KACHEL_STIL}
    >
      <ZeichenFeld icon={Zeichen} size={30} radius={8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-[16px] text-[#f2f0ef]">{titel}</span>
        <span className="block truncate text-[10.5px] leading-[14px] text-[#8c877e]">{unter}</span>
      </span>
      <ChevronRight size={13} className="shrink-0 text-[#8c877e]" />
    </button>
  );
}

// ---------------------------------------------------------------------
// Die uebrigen Reiter
// ---------------------------------------------------------------------

function CreatorZugriff() {
  return (
    <div className={[KARTE, "mt-[18px] p-[22px]"].join(" ")} style={KARTE_STIL}>
      <div className="flex items-start gap-[13px]">
        <ZeichenFeld icon={Link2} size={38} radius={10} glanz />
        <div>
          <h2 className="text-[15px] font-semibold text-[#f5f5f5]">Creator Access</h2>
          <p className="mt-[3px] max-w-2xl text-[12px] leading-[18px] text-[#8b93a0]">
            In ReelForge, creator access isn't assigned per member. Everyone in the workspace works on the full
            roster — what a member may <em>do</em> with it is decided by their role, not by a list of creators.
          </p>
          <p className="mt-[10px] max-w-2xl text-[12px] leading-[18px] text-[#8b93a0]">
            If you want per-member creator assignments, that's a real feature with a database change behind it, not a
            setting that's hidden somewhere. Say the word and we'll scope it.
          </p>
        </div>
      </div>
    </div>
  );
}

function RollenUndRechte({ members }: { members: TeamMember[] }) {
  const rollen: WorkspaceRole[] = ["owner", "manager", "va"];
  const faehigkeiten: { label: string; gilt: (r: WorkspaceRole) => boolean }[] = [
    { label: "See everything in the workspace", gilt: () => true },
    { label: "Invite and remove members", gilt: (r) => r === "owner" || r === "manager" },
    { label: "Change someone's role", gilt: (r) => r === "owner" },
    { label: "Open Billing", gilt: (r) => r === "owner" || r === "manager" },
    { label: "Change the plan", gilt: (r) => r === "owner" },
    { label: "Grant another Manager plan rights", gilt: (r) => r === "owner" },
  ];
  return (
    <div className={[KARTE, "mt-[18px] p-[22px]"].join(" ")} style={KARTE_STIL}>
      <div className="flex items-start gap-[13px]">
        <ZeichenFeld icon={Shield} size={38} radius={10} glanz />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-[#f5f5f5]">Roles &amp; Permissions</h2>
          <p className="mt-[3px] text-[12px] text-[#8b93a0]">
            Three roles, and what each one may actually do. Every line here is enforced in the database as well — the
            interface only hides what a role couldn't use anyway.
          </p>

          <div className="mt-[16px] overflow-hidden rounded-[9px] border border-[#1c1c20]">
            <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-[10px] border-b border-[#1c1c20] bg-[#0b0b0d] px-[14px] py-[10px] text-[11px] uppercase tracking-[0.05em] text-[#8b93a0]">
              <span>Capability</span>
              {rollen.map((r) => (
                <span key={r} className="text-center">
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </div>
            {faehigkeiten.map((f) => (
              <div
                key={f.label}
                className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-[10px] border-b border-[#131317] px-[14px] py-[11px] last:border-b-0"
              >
                <span className="text-[12.5px] text-[#d4d4d4]">{f.label}</span>
                {rollen.map((r) => (
                  <span key={r} className="flex justify-center">
                    {f.gilt(r) ? (
                      <span className="h-[7px] w-[7px] rounded-full bg-[#63c07f]" />
                    ) : (
                      <span className="h-[1.5px] w-[11px] rounded-full bg-[#3a3a40]" />
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-[14px] flex flex-wrap gap-[10px]">
            {rollen.map((r) => {
              const n = members.filter((m) => m.role === r).length;
              return (
                <div key={r} className={[KACHEL, "flex items-center gap-[10px] px-[13px] py-[10px]"].join(" ")} style={KACHEL_STIL}>
                  <RollenPlakette rolle={r} />
                  <span className="text-[11.5px] text-[#8b93a0]">
                    {n} member{n === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EinladungenReiter({
  invites,
  darfVerwalten,
  atMax,
  onZuruecknehmen,
  onEinladen,
}: {
  invites: { id: string; email: string; role: "manager" | "va"; createdAt: string; sydAccess: boolean }[];
  darfVerwalten: boolean;
  atMax: boolean;
  onZuruecknehmen: (id: string) => void;
  onEinladen: () => void;
}) {
  return (
    <div className={[KARTE, "mt-[18px] p-[22px]"].join(" ")} style={KARTE_STIL}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-[13px]">
          <ZeichenFeld icon={Mail} size={38} radius={10} glanz />
          <div>
            <h2 className="text-[15px] font-semibold text-[#f5f5f5]">Invites</h2>
            <p className="mt-[3px] text-[12px] text-[#8b93a0]">
              Invitations that have been sent but not accepted yet.
            </p>
          </div>
        </div>
        {darfVerwalten && !atMax && (
          <button
            onClick={onEinladen}
            className="flex h-[38px] shrink-0 items-center gap-[8px] rounded-[8px] border border-[#D39448]/50 bg-[#17171a] px-[14px] text-[12px] text-[#EAC088] hover:bg-[#1d1a16] transition-colors duration-150"
          >
            <Plus size={14} />
            Invite Member
          </button>
        )}
      </div>

      {invites.length === 0 ? (
        <p className="mt-[18px] text-[12.5px] text-[#8b93a0]">Nothing pending. Everyone you invited has joined.</p>
      ) : (
        <div className="mt-[16px] overflow-hidden rounded-[9px] border border-[#1c1c20]">
          {invites.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-[12px] border-b border-[#131317] px-[14px] py-[12px] last:border-b-0"
            >
              <Namenszeichen name={e.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-[#f5f5f5]">{e.email}</p>
                <p className="text-[11.5px] text-[#8b93a0]">Invited {vorZeit(e.createdAt)}</p>
              </div>
              <RollenPlakette rolle={e.role} />
              {e.sydAccess && (
                <Plakette ton="lila" icon={Building2}>
                  Sydney access
                </Plakette>
              )}
              <StatusPunkt ton="gold">Pending</StatusPunkt>
              {darfVerwalten && (
                <button
                  onClick={() => onZuruecknehmen(e.id)}
                  className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-[#8b93a0] hover:bg-white/[0.05] hover:text-[#e0664f] transition-colors duration-150"
                  title="Cancel invite"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AktivitaetReiter() {
  return (
    <div className={[KARTE, "mt-[18px] p-[22px]"].join(" ")} style={KARTE_STIL}>
      <div className="flex items-start gap-[13px]">
        <ZeichenFeld icon={AktivZeichen} size={38} radius={10} glanz />
        <div>
          <h2 className="text-[15px] font-semibold text-[#f5f5f5]">Activity</h2>
          <p className="mt-[3px] max-w-2xl text-[12px] leading-[18px] text-[#8b93a0]">
            ReelForge doesn't keep a team audit log — who invited whom, who changed a role, when someone last signed
            in. The Dashboard's activity feed records what happened to your content, not what your team did.
          </p>
          <p className="mt-[10px] max-w-2xl text-[12px] leading-[18px] text-[#8b93a0]">
            Rather than fill this with invented entries, it stays empty until there's something real behind it.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function EinladenFenster({
  atMax,
  onSchliessen,
  onSenden,
}: {
  atMax: boolean;
  onSchliessen: () => void;
  onSenden: (email: string, role: "manager" | "va", sydAccess?: boolean) => Promise<{ error: string | null }>;
}) {
  const [email, setEmail] = useState("");
  const [rolle, setRolle] = useState<"manager" | "va">("va");
  const [syd, setSyd] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function senden() {
    if (!email.trim()) {
      setFehler("Enter an email address first.");
      return;
    }
    setLaeuft(true);
    setFehler(null);
    const { error } = await onSenden(email.trim(), rolle, syd);
    setLaeuft(false);
    if (error) setFehler(error);
    else onSchliessen();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onSchliessen}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={[KARTE, "w-[420px] p-[22px]"].join(" ")}
        style={KARTE_STIL}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-[12px]">
            <ZeichenFeld icon={UserPlus} size={38} radius={10} glanz />
            <div>
              <h2 className="text-[15px] font-semibold text-[#f5f5f5]">Invite Member</h2>
              <p className="mt-[3px] text-[11.5px] text-[#8b93a0]">They'll get an email with a link to join.</p>
            </div>
          </div>
          <button
            onClick={onSchliessen}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[#8b93a0] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors duration-150"
          >
            <X size={15} />
          </button>
        </div>

        {atMax ? (
          <p className="mt-[16px] rounded-[8px] border border-[#3a2a17] bg-[#17120b] px-[12px] py-[10px] text-[12px] text-[#EAC088]">
            Your workspace is at its limit of {MAX_ADDITIONAL_MEMBERS} members besides the Owner. Remove someone or
            cancel a pending invite first.
          </p>
        ) : (
          <div className="mt-[16px] flex flex-col gap-[12px]">
            <Feld label="Email">
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFehler(null);
                }}
                placeholder="name@agency.com"
                className="h-[42px] w-full rounded-[8px] border border-[#26262b] bg-[#0e0e11] px-[11px] text-[12.5px] text-[#f5f5f5] outline-none placeholder:text-[#6e6a64] focus:border-[#D39448]/45"
              />
            </Feld>
            <Feld label="Role">
              <select
                value={rolle}
                onChange={(e) => setRolle(e.target.value as "manager" | "va")}
                className="h-[42px] w-full rounded-[8px] border border-[#26262b] bg-[#0e0e11] px-[11px] text-[12.5px] text-[#f5f5f5] outline-none"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r} className="bg-[#0e0e11]">
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <p className="mt-[5px] text-[11px] leading-[15px] text-[#8b93a0]">{ROLLE_WAS_DARF[rolle]}</p>
            </Feld>
            <label className="flex cursor-pointer items-start gap-[10px] rounded-[8px] border border-[#26262b] bg-[#0e0e11] px-[11px] py-[10px]">
              <input type="checkbox" checked={syd} onChange={(e) => setSyd(e.target.checked)} className="mt-[2px]" />
              <span>
                <span className="block text-[12.5px] text-[#f5f5f5]">Sydney Studio access</span>
                <span className="block text-[11px] text-[#8b93a0]">Lets them open Sydney Studio from the sidebar.</span>
              </span>
            </label>

            {fehler && <p className="text-[11.5px] text-[#ff8a8a]">{fehler}</p>}

            <button
              onClick={() => void senden()}
              disabled={laeuft}
              className="press-feedback flex h-[42px] items-center justify-center gap-[8px] rounded-[9px] text-[12.5px] font-medium text-[#2a1c0e] disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #D39448, #EAC088)" }}
            >
              <Mail size={15} />
              {laeuft ? "Sending…" : "Send invite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
