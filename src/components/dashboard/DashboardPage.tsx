import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Bell,
  ChevronDown,
  Clock,
  FolderOpen,
  HelpCircle,
  Search,
  Sun,
  MoreVertical,
  Radar,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import type { Collection, Creator } from "../../types";
import { Auftritt, Zahl } from "../shared/v3";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { Benachrichtigungen } from "../shared/Benachrichtigungen";
import { D, PanelKopf, Pille, Trend, Verlaufslinie, Zeichenkachel } from "./dashboardTeile";

// =====================================================================
// DAS DASHBOARD (14.10.2026, nach Emres Screenshot neu gebaut)
//
// Aufbau: Kopfbereich, fuenf Kennzahlen, drei Arbeitsflaechen
// (Production Overview / Creator Momentum / Next Actions), unten
// Recent Concepts und Recent Activity.
//
// DIE ERDKUGEL AUS DER VORLAGE KOMMT NICHT MIT. Emre hat sie
// ausdruecklich ausgenommen -- der Kopfbereich behaelt unseren
// Sternenhimmel.
//
// WAS ECHT IST UND WAS FEHLT -- bitte vor dem naechsten Umbau lesen:
//
//   ECHT    Alle Zahlen, alle Namen, alle Zeiten. Die Trendzahlen und
//           Verlaufslinien bei "In Production", "Needs Attention" und
//           "Delivered" sind aus den echten Einreichungsdaten gerechnet
//           (sentAt): letzte 30 Tage gegen die 30 Tage davor.
//
//   FEHLT   "Active Creators" und "Saved Concepts" haben KEINE Trendzahl
//           und keine Verlaufslinie -- Creator und Konzepte tragen kein
//           Datum, aus dem sich ein Verlauf rechnen liesse. Der Platz
//           bleibt leer statt mit einer erfundenen Prozentzahl gefuellt.
//
//           Bei "Creator Momentum" steht im Entwurf ein Wachstum je
//           Creator (+142%). Dafuer gibt es keine Historie. Statt dessen
//           steht dort der echte Anteil am Gesamtbestand.
// =====================================================================

const STAGE_ORDER = ["Saved", "In Review", "In Production", "Delivered", "Cancelled"] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_COLOR: Record<Stage, string> = {
  Saved: "#8b93a0",
  "In Review": "#5eb1ff",
  "In Production": "#f1a846",
  Delivered: "#63c07f",
  Cancelled: "#e0664f",
};

function collectionStage(c: Collection): Stage {
  if (c.status === "Completed") return "Delivered";
  if (c.status === "Draft") return "Saved";
  const latest = c.submissions[c.submissions.length - 1];
  if (latest && (latest.status === "In Progress" || latest.status === "Check Inbox")) return "In Production";
  if (latest && latest.status === "Cancelled") return "Cancelled";
  return "In Review";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function vorZeit(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const std = Math.floor(ms / 3600000);
  if (std < 1) return "just now";
  if (std < 24) return `${std} hour${std === 1 ? "" : "s"} ago`;
  const tage = Math.floor(std / 24);
  return `${tage} day${tage === 1 ? "" : "s"} ago`;
}

// Der Zeitraum oben rechts. Er ist kein Schmuck: er bestimmt, worueber
// die Trendzahlen und die Verlaufslinien gerechnet werden.
const ZEITRAEUME = [
  { tage: 7, label: "Last 7 days" },
  { tage: 30, label: "Last 30 days" },
  { tage: 90, label: "Last 90 days" },
] as const;

/** Acht gleich grosse Abschnitte ueber den gewaehlten Zeitraum.
 *  Grundlage fuer die Verlaufslinien -- gerechnet, nicht erfunden. */
function verlauf(zeitpunkte: string[], tage: number): number[] {
  const jetzt = Date.now();
  const spanne = (tage * 24 * 3600 * 1000) / 8;
  const eimer = new Array(8).fill(0);
  for (const z of zeitpunkte) {
    const alter = jetzt - new Date(z).getTime();
    const i = 7 - Math.floor(alter / spanne);
    if (i >= 0 && i < 8) eimer[i] += 1;
  }
  return eimer;
}

/** Der gewaehlte Zeitraum gegen den gleich langen davor, in Prozent.
 *  Null, wenn die Vorperiode leer war -- aus nichts laesst sich kein
 *  Wachstum rechnen. */
function trend(zeitpunkte: string[], tage: number): number | null {
  const jetzt = Date.now();
  const t = tage * 24 * 3600 * 1000;
  let jung = 0;
  let alt = 0;
  for (const z of zeitpunkte) {
    const alterMs = jetzt - new Date(z).getTime();
    if (alterMs <= t) jung += 1;
    else if (alterMs <= 2 * t) alt += 1;
  }
  if (alt === 0) return null;
  return ((jung - alt) / alt) * 100;
}

function StageDonut({ counts, total }: { counts: Record<Stage, number>; total: number }) {
  const size = 124;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const umfang = 2 * Math.PI * r;
  let offset = 0;
  const segmente = STAGE_ORDER.filter((s) => counts[s] > 0).map((stage) => {
    const anteil = total > 0 ? counts[stage] / total : 0;
    const strich = anteil * umfang;
    const seg = { stage, strich, offset };
    offset += strich;
    return seg;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {segmente.map(({ stage, strich, offset: so }) => (
          <circle
            key={stage}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={STAGE_COLOR[stage]}
            strokeWidth={stroke}
            strokeDasharray={`${strich} ${umfang - strich}`}
            strokeDashoffset={-so}
            strokeLinecap="butt"
            style={{ filter: `drop-shadow(0 0 4px ${STAGE_COLOR[stage]}80)` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-bold leading-[28px] tabular-nums tracking-[-0.6px]" style={{ color: D.weiss }}>
          <Zahl wert={total} />
        </span>
        <span className="mt-[1px] text-[10px]" style={{ color: D.leise }}>
          Total Concepts
        </span>
      </div>
    </div>
  );
}

/** Die kleinen Knoepfe rechts in der oberen Leiste. */
function LeistenKnopf({
  icon: Zeichen,
  title,
  punkt,
  onClick,
}: {
  icon: typeof Bell;
  title: string;
  punkt?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      // In der Vorlage stehen diese drei Zeichen FREI -- kein Kasten,
      // kein Rand. Nur das Namenszeichen ganz rechts ist eine Flaeche
      // (Emre, 14.10.2026).
      className="relative flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-white/[0.06]"
      style={{ color: "#d7dae0" }}
    >
      <Zeichen size={16.5} strokeWidth={1.7} />
      {punkt && (
        <span
          className="absolute right-[5px] top-[5px] h-[6px] w-[6px] rounded-full"
          style={{ background: "#ff5a5a", boxShadow: "0 0 7px #ff5a5a" }}
        />
      )}
    </button>
  );
}

export function DashboardPage({
  userName,
  creators,
  collections,
  activity,
  onOpenHub,
  onOpenResearch,
  onOpenCollection,
  onOpenCollections,
  onOpenCreators,
  onOpenProduction,
  onOpenSettings,
}: {
  userName?: string;
  creators: Creator[];
  collections: Collection[];
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenHub: () => void;
  onOpenResearch: () => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenCollections: () => void;
  onOpenCreators: () => void;
  onOpenProduction: () => void;
  onOpenSettings?: () => void;
}) {
  const firstName = userName ? (userName.includes("@") ? userName.split("@")[0] : userName) : "";
  const [suche, setSuche] = useState("");
  const [tage, setTage] = useState<number>(30);
  const [zeitraumOffen, setZeitraumOffen] = useState(false);

  const z = useMemo(() => {
    const alle = collections.flatMap((c) => c.submissions.map((s) => ({ ...s, collection: c })));
    const laufend = alle.filter((s) => s.status !== "Finished" && s.status !== "Cancelled");
    const achtung = alle.filter((s) => s.status === "Check Inbox");
    const geliefert = alle.filter((s) => s.status === "Finished");
    const gespeichert = collections.reduce((n, c) => n + c.concepts.length, 0);

    const stufen = STAGE_ORDER.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<Stage, number>);
    for (const c of collections) stufen[collectionStage(c)] += 1;

    return {
      alle,
      laufend,
      achtung,
      geliefert,
      gespeichert,
      stufen,
      stufenGesamt: collections.length,
    };
  }, [collections]);

  // Die fuenf Kennzahlen. Trend und Verlaufslinie stehen NUR dort, wo es
  // echte Zeitpunkte gibt -- siehe Kopf der Datei.
  const kennzahlen = [
    {
      icon: Users,
      wert: creators.length,
      label: "Active Creators",
      unter: `${creators.length === 1 ? "creator" : "creators"} in your workspace`,
      trend: null as number | null,
      verlauf: [] as number[],
      farbe: D.gold,
      onClick: onOpenCreators,
    },
    {
      icon: FolderOpen,
      wert: z.gespeichert,
      label: "Saved Concepts",
      unter: `across ${collections.length} collection${collections.length === 1 ? "" : "s"}`,
      trend: null,
      verlauf: [],
      farbe: D.gold,
      onClick: onOpenCollections,
    },
    {
      icon: Clapperboard,
      wert: z.laufend.length,
      label: "In Production",
      unter: `${z.laufend.length} moving forward`,
      trend: trend(z.laufend.map((s) => s.sentAt), tage),
      verlauf: verlauf(z.laufend.map((s) => s.sentAt), tage),
      farbe: "#f1a846",
      onClick: onOpenProduction,
    },
    {
      icon: AlertTriangle,
      wert: z.achtung.length,
      label: "Needs Attention",
      unter: z.achtung.length ? "waiting on your input" : "nothing waiting",
      trend: trend(z.achtung.map((s) => s.sentAt), tage),
      verlauf: verlauf(z.achtung.map((s) => s.sentAt), tage),
      farbe: D.rot,
      onClick: onOpenProduction,
    },
    {
      icon: CheckCircle2,
      wert: z.geliefert.length,
      label: "Delivered",
      unter: "finished batches",
      trend: trend(z.geliefert.map((s) => s.sentAt), tage),
      verlauf: verlauf(z.geliefert.map((s) => s.sentAt), tage),
      farbe: D.gruen,
      onClick: onOpenProduction,
    },
  ];

  // Creator Momentum: echte Anteile am Konzeptbestand. Ein Wachstum je
  // Creator, wie es der Entwurf zeigt, gibt es in den Daten nicht.
  const momentum = useMemo(() => {
    const proCreator = new Map<string, number>();
    for (const c of collections) {
      for (const k of c.concepts) {
        const id = k.creatorId ?? c.creatorId;
        proCreator.set(id, (proCreator.get(id) ?? 0) + 1);
      }
    }
    const gesamt = [...proCreator.values()].reduce((a, b) => a + b, 0);
    return creators
      .map((c) => ({ creator: c, anzahl: proCreator.get(c.id) ?? 0 }))
      .filter((r) => r.anzahl > 0)
      .sort((a, b) => b.anzahl - a.anzahl)
      .slice(0, 4)
      .map((r) => ({ ...r, anteil: gesamt > 0 ? Math.round((r.anzahl / gesamt) * 100) : 0 }));
  }, [creators, collections]);

  // Next Actions: echte offene Punkte, nach Dringlichkeit.
  const naechste = useMemo(() => {
    const liste: { id: string; titel: string; unter: string; farbe: string; icon: typeof Clock; bild?: string; collectionId: string }[] = [];
    for (const s of z.achtung) {
      liste.push({
        id: `inbox-${s.id}`,
        titel: "Production update needed",
        unter: `${s.collection.name} is waiting on you`,
        farbe: D.rot,
        icon: AlertTriangle,
        bild: s.collection.concepts[0]?.video.thumbnailUrl,
        collectionId: s.collection.id,
      });
    }
    for (const c of collections.filter((c) => c.status === "Draft" && c.concepts.length > 0).slice(0, 3)) {
      liste.push({
        id: `draft-${c.id}`,
        titel: `Review ${c.concepts.length} concept${c.concepts.length === 1 ? "" : "s"}`,
        unter: `${c.name} is still a draft`,
        farbe: D.goldHell,
        icon: Sparkles,
        bild: c.concepts[0]?.video.thumbnailUrl,
        collectionId: c.id,
      });
    }
    for (const s of z.laufend.filter((s) => s.status === "In Progress").slice(0, 3)) {
      liste.push({
        id: `prog-${s.id}`,
        titel: "Check delivery status",
        unter: s.eta ? `${s.collection.name} — ETA ${s.eta}` : `${s.collection.name} is in production`,
        farbe: D.blau,
        icon: Clock,
        bild: s.collection.concepts[0]?.video.thumbnailUrl,
        collectionId: s.collection.id,
      });
    }
    return liste.slice(0, 5);
  }, [collections, z]);

  const letzteKonzepte = useMemo(
    () =>
      [...collections]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .flatMap((c) => c.concepts.map((k) => ({ konzept: k, sammlung: c })))
        .slice(0, 4),
    [collections]
  );

  const creatorById = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);

  return (
    <div className="h-full overflow-auto" style={{ background: "#020203" }}>
      {/* Breite und Seitenraender kommen aus demselben Baustein wie auf
          Production, Library und Creators (KOPF_RAHMEN). Vorher hatte das
          Dashboard eigene Zahlen und wirkte dadurch groesser als die
          uebrigen Reiter (Emre, 14.10.2026). Nur das obere Band laeuft
          bewusst ueber die volle Breite -- der Sternenhimmel soll nicht
          an einer Kante abreissen. */}
      <Auftritt className="mx-auto w-full max-w-[1900px]">
        {/* ============ KOPFBEREICH ============ */}
        {/* Unser Sternenhimmel bleibt. Die Erdkugel aus der Vorlage kommt
            ausdruecklich NICHT mit (Emre, 14.10.2026). */}
        <div
          className="relative px-6 pt-[16px] pb-[36px] xl:px-8"
          style={{
            background:
              "radial-gradient(620px 300px at 86% 2%, rgba(211,148,72,0.07), transparent 68%), #000000",
          }}
        >
          <div className="dashboard-starfield-boost absolute inset-0 overflow-hidden">
            <StarfieldBackground starCount={300} dustCount={5} />
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
            style={{ background: "linear-gradient(to bottom, transparent, #000000)" }}
          />

          {/* ---- Die obere Leiste (14.10.2026, nach Emres Vorlage) ----
              Sie liegt IM Kopfbereich, also ueber dem Sternenhimmel, und
              laesst den Hintergrund unberuehrt. */}
          <div className="relative mb-[32px] flex items-center justify-between gap-6">
            <div className="relative w-full max-w-[440px]">
              <Search
                size={15}
                strokeWidth={1.9}
                className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2"
                style={{ color: "#7e848e" }}
              />
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenHub();
                }}
                placeholder="Search concepts, creators, collections..."
                className="h-[37px] w-full rounded-[9px] border pl-[37px] pr-[14px] text-[12.5px] outline-none transition-colors duration-150 placeholder:text-[#7e848e] focus:border-[#D39448]/45"
                style={{ background: "rgba(10,11,13,0.78)", borderColor: "#24262b", color: D.weiss }}
              />
            </div>

            <div className="flex shrink-0 items-center gap-[8px]">
              {/* Der Zustand ist ECHT: er haengt an den Einreichungen, die
                  auf dich warten. */}
              <span
                className="inline-flex h-[37px] items-center gap-[8px] rounded-[9px] border px-[13px] text-[12.5px]"
                style={{ background: "rgba(10,11,13,0.78)", borderColor: "#24262b", color: "#d7dae0" }}
              >
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{
                    background: z.achtung.length ? D.rot : "#4ade80",
                    boxShadow: `0 0 8px ${z.achtung.length ? D.rot : "#4ade80"}`,
                  }}
                />
                {z.achtung.length
                  ? `${z.achtung.length} item${z.achtung.length === 1 ? "" : "s"} need you`
                  : "All systems operational"}
                <ChevronDown size={13} strokeWidth={1.9} style={{ color: "#7e848e" }} />
              </span>

              <LeistenKnopf icon={Sun} title="Light mode — not available yet" />
              <LeistenKnopf icon={HelpCircle} title="Help — not wired up yet" />
              {/* Die echte Glocke mit Klappfenster -- sie war hier bis
                  zum 14.10.2026 nur Zierde, die funktionierende sass in
                  der Seitenleiste. Jetzt ist es dieselbe. */}
              <Benachrichtigungen activity={activity} onOpenCollection={onOpenCollection} />

              <button
                onClick={onOpenSettings}
                title="Your account"
                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-[filter] duration-150 hover:brightness-110"
                style={{
                  color: "#020508",
                  background: "linear-gradient(113.9deg,#EAC088 0%,#D39448 100%)",
                  border: `1px solid ${D.gold}`,
                  boxShadow: "inset 0 1px 3px rgba(255,236,206,0.3), 0 0 16px rgba(211,148,72,0.25)",
                }}
              >
                {(firstName || "EM").slice(0, 2).toUpperCase()}
              </button>
            </div>
          </div>

          <div className="relative flex items-start justify-between gap-8">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: "#e8a94f" }}>
                ReelForge Command Center
              </p>
              <h1
                className="mt-[9px] text-[41px] font-bold leading-[49px] tracking-[-1.05px]"
                style={{ color: "#f4f5f7" }}
              >
                {greeting()}
                {firstName && (
                  <>
                    , <span className="rf-name-gold">{firstName}</span>
                  </>
                )}
                .
              </h1>
              <p className="mt-[8px] text-[15px] leading-[21px]" style={{ color: "#b8bcc4" }}>
                Turn creator insights into high-performing content, faster.
              </p>

              <div className="mt-[19px] flex items-center gap-[12px]">
                <button
                  onClick={onOpenResearch}
                  className="press-feedback inline-flex h-[42px] items-center gap-[9px] rounded-[9px] border px-[19px] text-[13.5px] font-semibold"
                  style={{
                    color: "#020508",
                    background: "linear-gradient(113.9deg,#EAC088 0%,#D39448 100%)",
                    borderColor: D.gold,
                    boxShadow: "inset 0 1px 3px rgba(255,236,206,0.3), 0 0 22px rgba(211,148,72,0.3)",
                  }}
                >
                  <Radar size={16} strokeWidth={2} />
                  Start Research
                  <ArrowRight size={16} strokeWidth={2.2} />
                </button>
                <button
                  onClick={onOpenProduction}
                  className="press-feedback inline-flex h-[42px] items-center gap-[9px] rounded-[9px] border px-[19px] text-[13.5px]"
                  style={{ color: "#e7e9ed", background: "rgba(16,17,20,0.8)", borderColor: "#2a2c31" }}
                >
                  <FolderOpen size={16} strokeWidth={1.8} />
                  Open Production
                </button>
              </div>
            </div>

            {/* Der Spruch rechts aus der Vorlage. Er sitzt dort NICHT auf
                Hoehe des Kuerzels, sondern tiefer -- etwa auf Hoehe der
                Unterzeile. Deshalb der Abstand nach oben (Emre,
                14.10.2026). */}
            <div className="mt-[66px] hidden shrink-0 text-right lg:block">
              <p className="text-[13px] leading-[20px]" style={{ color: "#aeb3bb" }}>
                “Ideas find their people.
                <br />
                We just make it happen faster.”
              </p>
              <span className="mt-[10px] ml-auto block h-[2px] w-[44px] rounded-full" style={{ background: "#e8a94f" }} />

            </div>
          </div>

          {/* Der Zeitraum steht auf dem Sternenhimmel, als letzte Zeile des
              Bandes -- und damit trotzdem direkt ueber den Kacheln, zu
              denen er gehoert (Emre, 14.10.2026). */}
          <div className="relative -mt-[6px] flex justify-end">
            <button
              onClick={() => setZeitraumOffen((v) => !v)}
              className="inline-flex h-[30px] items-center gap-[7px] rounded-[8px] px-[11px] text-[12.5px] transition-colors duration-150 hover:bg-white/[0.06]"
              style={{ color: "#9aa0aa" }}
            >
              {ZEITRAEUME.find((zz) => zz.tage === tage)?.label}
              <ChevronDown size={14} strokeWidth={1.9} />
            </button>
            {zeitraumOffen && (
              <div
                onMouseLeave={() => setZeitraumOffen(false)}
                className="absolute right-0 top-[34px] z-30 w-[152px] rounded-[9px] border p-[5px] text-left shadow-[0_14px_36px_rgba(0,0,0,0.55)]"
                style={{ background: "#17171a", borderColor: "#26262b" }}
              >
                {ZEITRAEUME.map((zz) => (
                  <button
                    key={zz.tage}
                    onClick={() => {
                      setTage(zz.tage);
                      setZeitraumOffen(false);
                    }}
                    className="w-full rounded-[6px] px-[9px] py-[7px] text-left text-[11.5px] hover:bg-white/[0.05]"
                    style={{ color: zz.tage === tage ? "#EAC088" : "#c9ced6" }}
                  >
                    {zz.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 -mt-[14px] px-6 pb-8 xl:px-8">
          {/* ============ FUENF KENNZAHLEN ============ */}
          <Auftritt verzoegerung={60} className="grid grid-cols-5 gap-[13px]">
            {kennzahlen.map((k) => (
              <button
                key={k.label}
                onClick={k.onClick}
                className="rounded-[11px] border px-[15px] py-[14px] text-left transition-colors duration-150 hover:border-[#2f2113]"
                style={{ background: D.flaeche, borderColor: D.rand }}
              >
                <div className="flex items-start gap-[11px]">
                  <Zeichenkachel icon={k.icon} size={35} farbe={k.farbe} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[9px]">
                      <span
                        className="text-[23px] font-bold leading-[27px] tabular-nums tracking-[-0.5px]"
                        style={{ color: D.weiss }}
                      >
                        <Zahl wert={k.wert} />
                      </span>
                      <Trend prozent={k.trend} />
                    </div>
                    <p className="mt-[2px] truncate text-[12px] leading-[16px]" style={{ color: "#d7dae0" }}>
                      {k.label}
                    </p>
                  </div>
                </div>
                <div className="mt-[9px] flex items-end justify-between gap-2">
                  <span className="truncate text-[10.5px] leading-[14px]" style={{ color: "#7e848e" }}>
                    {k.unter}
                  </span>
                  <Verlaufslinie werte={k.verlauf} farbe={k.farbe} />
                </div>
              </button>
            ))}
          </Auftritt>

          {/* ============ DREI ARBEITSFLAECHEN ============ */}
          <Auftritt verzoegerung={130} className="mt-[13px] grid grid-cols-[1.05fr_1fr_1fr] gap-[13px]">
            {/* ---- Production Overview ---- */}
            <div className="rounded-[11px] border p-[17px]" style={{ background: D.flaeche, borderColor: D.rand }}>
              <PanelKopf titel="Production Overview" unter="Real-time status of your content pipeline." />
              <div className="mt-[14px] flex items-center gap-[16px]">
                <StageDonut counts={z.stufen} total={z.stufenGesamt} />
                <div className="min-w-0 flex-1 flex flex-col gap-[9px]">
                  {STAGE_ORDER.map((stage) => (
                    <div key={stage} className="flex items-center gap-[9px]">
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: STAGE_COLOR[stage], boxShadow: `0 0 6px ${STAGE_COLOR[stage]}80` }}
                      />
                      <span className="text-[11.5px]" style={{ color: D.zeile }}>
                        {stage}
                      </span>
                      <span className="ml-auto text-[11.5px] font-semibold tabular-nums" style={{ color: D.weiss }}>
                        {z.stufen[stage]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---- Creator Momentum ---- */}
            <div className="rounded-[11px] border p-[17px]" style={{ background: D.flaeche, borderColor: D.rand }}>
              <PanelKopf
                titel="Creator Momentum"
                unter="Where your saved concepts are going."
                rechts={
                  <button
                    onClick={onOpenCreators}
                    className="inline-flex items-center gap-[4px] text-[11.5px] transition-colors duration-150 hover:text-[#EAC088]"
                    style={{ color: `${D.gold}b3` }}
                  >
                    View all <ArrowRight size={13} />
                  </button>
                }
              />
              <div className="mt-[14px] flex flex-col">
                {momentum.length === 0 && (
                  <p className="py-[18px] text-[12px]" style={{ color: D.leise }}>
                    No concepts saved yet.
                  </p>
                )}
                {momentum.map((r) => (
                  <button
                    key={r.creator.id}
                    onClick={onOpenCreators}
                    className="flex h-[48px] items-center gap-[10px] border-b text-left transition-colors duration-150 last:border-b-0 hover:bg-white/[0.02]"
                    style={{ borderColor: "#15100a" }}
                  >
                    <span
                      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold"
                      style={{ background: r.creator.avatarColor, color: "#0c0c0e" }}
                    >
                      {r.creator.profileImage ? (
                        <img src={r.creator.profileImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        r.creator.name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium leading-[16px]" style={{ color: D.weiss }}>
                        {r.creator.name}
                      </span>
                      <span className="block truncate text-[10.5px] leading-[14px]" style={{ color: D.leise }}>
                        {r.creator.handle}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] whitespace-nowrap" style={{ color: D.leise }}>
                      {r.anzahl} concept{r.anzahl === 1 ? "" : "s"}
                    </span>
                    {/* Statt eines erfundenen Wachstums: der echte Anteil
                        am Gesamtbestand, als Balken und als Zahl. */}
                    <span className="flex shrink-0 items-center gap-[8px]">
                      <span className="h-[5px] w-[46px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${r.anteil}%`, background: D.gruen, boxShadow: `0 0 6px ${D.gruen}80` }}
                        />
                      </span>
                      <span className="w-[32px] text-right text-[11.5px] font-semibold tabular-nums" style={{ color: D.gruen }}>
                        {r.anteil}%
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Next Actions ---- */}
            <div className="rounded-[11px] border p-[17px]" style={{ background: D.flaeche, borderColor: D.rand }}>
              <PanelKopf
                titel="Next Actions"
                unter="Keep the momentum going."
                rechts={
                  naechste.length > 0 ? (
                    <Pille farbe={D.goldHell}>{naechste.length}</Pille>
                  ) : (
                    <Pille farbe={D.gruen} icon={CheckCircle2}>
                      Clear
                    </Pille>
                  )
                }
              />
              <div className="mt-[13px] flex flex-col gap-[7px]">
                {naechste.length === 0 && (
                  <p className="py-[18px] text-[12px]" style={{ color: D.leise }}>
                    Everything is moving smoothly. Nothing needs your input right now.
                  </p>
                )}
                {naechste.map((a) => {
                  const Zeichen = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onOpenCollection(a.collectionId)}
                      className="flex items-center gap-[10px] rounded-[9px] border px-[10px] py-[7px] text-left transition-colors duration-150 hover:border-[#2f2113]"
                      style={{ background: D.karte, borderColor: D.rand }}
                    >
                      <span
                        className="h-[34px] w-[40px] shrink-0 overflow-hidden rounded-[6px]"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                      >
                        {a.bild && <img src={a.bild} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-[6px]">
                          <Zeichen size={12} strokeWidth={2.2} style={{ color: a.farbe }} className="shrink-0" />
                          <span className="truncate text-[12px] leading-[16px]" style={{ color: D.weiss }}>
                            {a.titel}
                          </span>
                        </span>
                        <span className="mt-[1px] block truncate text-[10.5px] leading-[14px]" style={{ color: D.leise }}>
                          {a.unter}
                        </span>
                      </span>
                      <ChevronRight size={14} className="shrink-0" style={{ color: D.leise }} />
                    </button>
                  );
                })}
              </div>
            </div>
          </Auftritt>

          {/* ============ UNTEN: KONZEPTE UND VERLAUF ============ */}
          <Auftritt verzoegerung={200} className="mt-[13px] grid grid-cols-[1.7fr_1fr] gap-[13px]">
            {/* ---- Recent Concepts ---- */}
            <div className="rounded-[11px] border p-[17px]" style={{ background: D.flaeche, borderColor: D.rand }}>
              <PanelKopf
                titel="Recent Concepts"
                unter="Latest concepts from your workspace."
                rechts={
                  <button
                    onClick={onOpenHub}
                    className="inline-flex items-center gap-[4px] text-[11.5px] transition-colors duration-150 hover:text-[#EAC088]"
                    style={{ color: `${D.gold}b3` }}
                  >
                    View all <ArrowRight size={13} />
                  </button>
                }
              />
              <div className="mt-[14px] grid grid-cols-4 gap-[11px]">
                {letzteKonzepte.length === 0 && (
                  <p className="col-span-4 py-[18px] text-[12px]" style={{ color: D.leise }}>
                    Nothing saved yet. Start a research session to fill this.
                  </p>
                )}
                {letzteKonzepte.map(({ konzept, sammlung }) => {
                  const stufe = collectionStage(sammlung);
                  const creator = creatorById.get(konzept.creatorId ?? sammlung.creatorId);
                  return (
                    <button
                      key={`${sammlung.id}-${konzept.video.id}`}
                      onClick={() => onOpenCollection(sammlung.id)}
                      className="group overflow-hidden rounded-[10px] border text-left transition-colors duration-150 hover:border-[#2f2113]"
                      style={{ background: D.karte, borderColor: D.rand }}
                    >
                      <span
                        className="relative block aspect-[4/5] w-full overflow-hidden"
                        style={{ background: konzept.video.thumbGradient ?? "rgba(255,255,255,0.05)" }}
                      >
                        {konzept.video.thumbnailUrl && (
                          <img src={konzept.video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        )}
                        <span
                          className="absolute right-[8px] top-[8px] rounded-[5px] px-[6px] py-[2px] text-[10.5px] tabular-nums"
                          style={{ background: "rgba(0,0,0,0.62)", color: "#f0f0f2" }}
                        >
                          {konzept.video.duration}
                        </span>
                      </span>
                      <span className="block px-[11px] pb-[11px] pt-[10px]">
                        <Pille farbe={STAGE_COLOR[stufe]}>{stufe}</Pille>
                        <span className="mt-[7px] block truncate text-[12px] leading-[16px]" style={{ color: D.weiss }}>
                          {sammlung.name}
                        </span>
                        <span className="mt-[5px] flex items-center justify-between gap-2">
                          <span className="truncate text-[11px]" style={{ color: D.leise }}>
                            {creator?.name ?? "—"}
                          </span>
                          <MoreVertical size={13} style={{ color: D.leise }} className="shrink-0" />
                        </span>
                        <span className="mt-[2px] block truncate text-[10.5px]" style={{ color: D.leise }}>
                          {vorZeit(sammlung.updatedAt)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- Recent Activity ---- */}
            <div className="rounded-[11px] border p-[17px]" style={{ background: D.flaeche, borderColor: D.rand }}>
              <PanelKopf
                titel="Recent Activity"
                unter="What's happening in your workspace."
                rechts={
                  <button
                    onClick={onOpenCollections}
                    className="inline-flex items-center gap-[4px] text-[11.5px] transition-colors duration-150 hover:text-[#EAC088]"
                    style={{ color: `${D.gold}b3` }}
                  >
                    View all <ArrowRight size={13} />
                  </button>
                }
              />
              <div className="mt-[12px] flex flex-col">
                {activity.loading && (
                  <p className="py-[18px] text-[12px]" style={{ color: D.leise }}>
                    Loading…
                  </p>
                )}
                {!activity.loading && activity.items.length === 0 && (
                  <p className="py-[18px] text-[12px]" style={{ color: D.leise }}>
                    Nothing has happened yet.
                  </p>
                )}
                {activity.items.slice(0, 5).map((item) => {
                  const sammlung = item.collectionId ? collectionById.get(item.collectionId) : undefined;
                  const bild = sammlung?.concepts[0]?.video.thumbnailUrl;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.collectionId && onOpenCollection(item.collectionId)}
                      disabled={!item.collectionId}
                      className="flex h-[50px] items-center gap-[10px] border-b text-left transition-colors duration-150 last:border-b-0 hover:bg-white/[0.02] disabled:hover:bg-transparent"
                      style={{ borderColor: "#15100a" }}
                    >
                      <span
                        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px]"
                        style={{ background: "rgba(211,148,72,0.10)", border: "1px solid rgba(211,148,72,0.22)" }}
                      >
                        <TrendingUp size={13} strokeWidth={1.9} style={{ color: D.gold }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] leading-[16px]" style={{ color: D.weiss }}>
                          {item.message}
                        </span>
                        <span className="block text-[10.5px] leading-[14px]" style={{ color: D.leise }}>
                          {item.relativeTime}
                        </span>
                      </span>
                      {bild && (
                        <span className="h-[30px] w-[30px] shrink-0 overflow-hidden rounded-[6px]">
                          <img src={bild} alt="" className="h-full w-full object-cover" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Auftritt>
        </div>
      </Auftritt>
    </div>
  );
}
