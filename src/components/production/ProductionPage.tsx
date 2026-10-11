import { useMemo, useState } from "react";
import { Auftritt } from "../shared/v3";
import { KOPF_ABSTAND, KOPF_KUERZEL, KOPF_TITEL, KOPF_UNTERZEILE } from "../../lib/pageHeader";
import { Activity, AlertTriangle, Ban, CheckCircle2, ChevronDown, Circle, Clapperboard, Database, Plus, Search, Sparkles } from "lucide-react";
import type { Collection, Creator, SubmissionStatus } from "../../types";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { panelStil, PANEL_FUELLUNG, PANEL_RAND, KARTE_FUELLUNG } from "../../lib/panelLook";
import { StarfieldBackground } from "../shared/StarfieldBackground";

// Alle Zahlen und Farben hier stammen aus dem Figma-Knoten 3373:623 (dem
// Durchlauf, bei dem die Umwandlung echte Ebenen erzeugt hat) -- nicht
// geschaetzt. Wo der Entwurf und die App auseinandergehen, steht es am
// jeweiligen Ort dabei.
//
// Zwei bewusste Abweichungen, beide aus demselben Grund wie in Collections:
//   - Schriften: der Entwurf nutzt Playfair Display und DM Sans, die App hat
//     Fraunces und Inter. Global tauschen haette jede andere Seite veraendert.
//   - Der Sternenhimmel im Kopf kommt aus der App (Research Accounts), im
//     Entwurf ist er ein eingebettetes Bild.

// Flaechen kommen aus der DNA (Dashboard -> Research Accounts ->
// Collections), nicht aus dem Entwurf: dasselbe Panel, derselbe Rahmen,
// derselbe Schatten. Die Akzente -- Abschnittsgold, Statuspillen, Zeichen --
// bleiben die des Entwurfs.
const PANEL = "rounded-xl border border-[#1a130b]";
const PANEL_STYLE = panelStil(true);

// Zeilenverlauf der Pipeline (Figma 3373:796).
const ROW = "border border-white/[0.07] hover:border-[#D39448]/35 hover:bg-[#161613]";

// Die Beschriftungen des Entwurfs auf die Zustaende, die es wirklich gibt.
// "Review" heisst im Bestand "Sent": abgeschickt, noch nicht angefasst.
// Die Zeichen aus dem Bild: Warndreieck, zwei offene Kreise, Haken im
// Kreis, durchgestrichener Kreis -- jeweils in ihrer Farbe.
const CHIPS: {
  label: string;
  status: SubmissionStatus;
  farbe: string;
  Zeichen: typeof Circle;
}[] = [
  { label: "Needs Attention", status: "Check Inbox", farbe: "#ff4047", Zeichen: AlertTriangle },
  { label: "In Production", status: "In Progress", farbe: "#258eff", Zeichen: Circle },
  { label: "Review", status: "Sent", farbe: "#f2a633", Zeichen: Circle },
  { label: "Finished", status: "Finished", farbe: "#31c98c", Zeichen: CheckCircle2 },
  { label: "Cancelled", status: "Cancelled", farbe: "#ff474d", Zeichen: Ban },
];

// Die Statuspille aus dem Entwurf (Figma 3373:818): Radialverlauf,
// 2px-Ring in der Statusfarbe, Schein 0 0 8px in derselben Farbe.
// Der Blauton ist wortgleich uebernommen, die anderen vier sind derselbe
// Aufbau in ihrer jeweiligen Farbe.
const STATUS_TEXT: Record<
  SubmissionStatus,
  { label: string; color: string; von: string; bis: string; schein: string }
> = {
  "Check Inbox": { label: "Needs Attention", color: "#ff6a6f", von: "rgba(63,24,26,1)", bis: "rgba(33,15,16,1)", schein: "rgba(231,60,65,0.14)" },
  "In Progress": { label: "In Production", color: "#5eb1ff", von: "rgba(20,40,63,1)", bis: "rgba(13,23,33,1)", schein: "rgba(35,132,231,0.14)" },
  Sent: { label: "Review", color: "#f2b552", von: "rgba(63,48,20,1)", bis: "rgba(33,26,13,1)", schein: "rgba(231,160,35,0.14)" },
  Finished: { label: "Delivered", color: "#3fd096", von: "rgba(18,56,42,1)", bis: "rgba(11,28,22,1)", schein: "rgba(35,208,150,0.14)" },
  Cancelled: { label: "Cancelled", color: "#ff5358", von: "rgba(56,22,24,1)", bis: "rgba(28,13,14,1)", schein: "rgba(231,60,65,0.10)" },
};

function StatusPille({ status }: { status: SubmissionStatus }) {
  const st = STATUS_TEXT[status];
  return (
    <span
      className="h-[26px] min-w-[92px] pl-2.5 pr-3 rounded-[13px] flex items-center gap-1.5 shrink-0"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 50%, ${st.von} 0%, ${st.bis} 100%)`,
        filter: `drop-shadow(0 0 8px ${st.schein})`,
      }}
    >
      <span
        className="w-2 h-2 rounded-[3px] border-2 shrink-0"
        style={{ borderColor: st.color }}
      />
      <span className="text-[10px] whitespace-nowrap" style={{ color: st.color }}>
        {st.label}
      </span>
    </span>
  );
}

// Der naechste Schritt ist im Bestand nicht gespeichert. Statt einen zu
// erfinden, wird er aus dem Zustand abgeleitet -- das ist wahr und sagt
// dasselbe wie der Entwurf.
const NAECHSTER_SCHRITT: Record<SubmissionStatus, string> = {
  "Check Inbox": "Next: Your reply",
  "In Progress": "Next: In production",
  Sent: "Next: Pickup by ReelForge",
  Finished: "Delivered",
  Cancelled: "Cancelled",
};

interface ProductionRow {
  submissionId: string;
  index: number;
  status: SubmissionStatus;
  sentAt: string;
  eta?: string;
  conceptCount: number;
  deliveryUrl?: string;
  collectionId: string;
  collectionName: string;
  creator?: Creator;
  thumbnailUrl?: string;
  thumbGradient?: string;
}

export function ProductionPage({
  creators,
  collections,
  onOpenCollection,
}: {
  creators: Creator[];
  collections: Collection[];
  onOpenCollection: (collectionId: string) => void;
}) {
  const [creatorId, setCreatorId] = useState<string | "all">("all");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [suche, setSuche] = useState("");

  const alleZeilen: ProductionRow[] = useMemo(
    () =>
      collections
        .flatMap((c) =>
          c.submissions.map((s) => {
            const cover = c.concepts[0]?.video;
            return {
              submissionId: s.id,
              index: s.index,
              status: s.status,
              sentAt: s.sentAt,
              eta: s.eta,
              conceptCount: s.conceptIds.length,
              deliveryUrl: s.deliveryUrl,
              collectionId: c.id,
              collectionName: c.name,
              creator: creators.find((cr) => cr.id === c.creatorId),
              thumbnailUrl: cover?.thumbnailUrl,
              thumbGradient: cover?.thumbGradient,
            };
          })
        )
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [collections, creators]
  );

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return alleZeilen.filter((r) => {
      if (creatorId !== "all" && r.creator?.id !== creatorId) return false;
      if (!begriff) return true;
      return (
        r.collectionName.toLowerCase().includes(begriff) ||
        (r.creator?.name ?? "").toLowerCase().includes(begriff)
      );
    });
  }, [alleZeilen, creatorId, suche]);

  const zahl = (s: SubmissionStatus) => gefiltert.filter((r) => r.status === s).length;

  const sichtbar = status === "all" ? gefiltert : gefiltert.filter((r) => r.status === status);
  const aufmerksam = sichtbar.filter((r) => r.status === "Check Inbox");
  const laufend = sichtbar.filter((r) => r.status === "In Progress" || r.status === "Sent");
  const fertig = sichtbar.filter((r) => r.status === "Finished");
  const abgebrochen = sichtbar.filter((r) => r.status === "Cancelled");

  const aktiverCreator = creators.find((c) => c.id === creatorId);

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203" }}>
      <style>{`
        .rf-chiprolle { scrollbar-width: none; -ms-overflow-style: none; }
        .rf-chiprolle::-webkit-scrollbar { display: none; }
        .rf-production-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-production-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>

      {/* Derselbe Container wie in Library: bei 1509 Punkten Fensterbreite --
          der Breite, auf der wirklich gearbeitet wird -- liess der alte
          Container (1400 breit, 40 Rand) nur 1214 Punkte fuer den Inhalt und
          die Seite wirkte herangezoomt. Jetzt starten alle drei Seiten an
          derselben Stelle. */}
      {/* Die Seite blendet beim Oeffnen weich auf, statt auf einen Schlag
          dazustehen -- derselbe Auftritt wie auf Billing (11.10.2026). */}
      <Auftritt className="relative max-w-[1900px] mx-auto px-6 xl:px-8 pt-8 pb-8">
        {/* Wortgleich der Sternenhimmel aus Collections: 160 hoch, 110
            Sterne, kein Verlauf darueber. Vorher 190 mit 130 Sternen und
            einem Verlauf aus dem Entwurf -- damit sah er anders aus als auf
            den anderen Seiten. */}
        <div className="dashboard-starfield-boost rf-production-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>

        {/* Kopf — Figma 3373:625 */}
        {/* Kopf: Text links, Knopf rechts -- nebeneinander in einer Zeile
            statt frei am Seitenrand haengend. Vorher sass der Knopf absolut
            am Container und wanderte bei jeder Abstandsaenderung mit; jetzt
            haengt er an der Kopfzeile und bleibt oben, wo er hingehoert. */}
        <div className="relative flex items-start justify-between gap-6">
          <div className="min-w-0">
            <span className={KOPF_KUERZEL}>Production</span>
            <h1 className={KOPF_TITEL}>
              Everything in motion.
            </h1>
            <p className={`${KOPF_UNTERZEILE} tracking-[0.1px] text-[#bdbdc1] max-w-[920px]`}>
              Turn concepts into high-performing content. Track, produce, and ship across all creators and sources.
            </p>
          </div>

          {/* Nur Optik: einen neuen Auftrag startet man heute aus einer
              Collection heraus ("Send to ReelForge"). Deshalb keine erfundene
              Handlung dahinter. */}
          <div
            title="Productions are started from a Collection"
            className="shrink-0 h-9 px-4 rounded-lg flex items-center justify-center gap-2 cursor-default select-none"
            style={{
              backgroundImage: "linear-gradient(90deg, #D39448, #EAC088)",
              boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)",
            }}
          >
            <Plus size={14} strokeWidth={2.4} className="text-[#020508]" />
            <span className="text-[12.5px] font-medium text-[#020508]">New Production</span>
          </div>
        </div>

        {/* Filterleiste — Figma 3373:636.
            Die Leiste selbst bleibt auf overflow-hidden: die Chiprolle und das
            schrumpfende Suchfeld brauchen das. Das Creator-Menue haengt deshalb
            eine Ebene hoeher, ausserhalb der beschnittenen Flaeche -- darin
            wurde es an der Leistenkante abgeschnitten und verschwand hinter den
            Panels darunter. */}
        <div className={`relative ${KOPF_ABSTAND}`}>
        <div
          className="h-[52px] p-[7px] rounded-xl border border-[#1a130b] flex flex-nowrap items-center gap-2 overflow-hidden"
          style={{ background: PANEL_FUELLUNG, borderColor: PANEL_RAND }}
        >
          <div className="shrink-0">
            <button
              onClick={() => setCreatorOpen((v) => !v)}
              className="min-w-[132px] h-[34px] px-3 rounded-full border border-white/[0.08] flex items-center gap-2 text-[12.5px] text-neutral-200 hover:text-neutral-50 hover:border-[#D39448]/35 transition-colors duration-150"
            >
              <span
                className="w-[18px] h-[18px] rounded-full shrink-0 overflow-hidden"
                style={
                  aktiverCreator
                    ? aktiverCreator.profileImage
                      ? undefined
                      : { background: aktiverCreator.avatarColor, boxShadow: `0 0 8px 0 ${aktiverCreator.avatarColor}` }
                    : {
                        backgroundImage: "linear-gradient(135deg, rgb(199,101,237) 0%, rgb(214,144,250) 100%)",
                        boxShadow: "0 0 8px 0 #a94ee8",
                      }
                }
              >
                {aktiverCreator?.profileImage && (
                  <img src={aktiverCreator.profileImage} alt="" className="w-full h-full object-cover" />
                )}
              </span>
              <span className="truncate">{aktiverCreator?.name ?? "All Creators"}</span>
              <ChevronDown size={13} className="ml-auto shrink-0 text-[#939398]" />
            </button>
          </div>

          {/* Nur Optik: eine Quelle je Auftrag gibt es im Bestand nicht. */}
          <div
            title="Not available yet"
            className="min-w-[142px] h-[34px] px-3 rounded-full border border-white/[0.08] flex items-center gap-2 text-[12.5px] text-neutral-200 shrink-0 cursor-default select-none opacity-70"
          >
            <Database size={13} className="text-[#9b9ca1] shrink-0" />
            All Sources
            <ChevronDown size={13} className="ml-auto shrink-0 text-[#939398]" />
          </div>

          <div className="rf-chiprolle flex flex-nowrap items-center gap-[5px] min-w-0 overflow-x-auto h-[38px] px-[6px] rounded-[19px] bg-[#101113] border border-[#26282b]">
            <Chip label="All" count={gefiltert.length} aktiv={status === "all"} onClick={() => setStatus("all")} />
            {CHIPS.map((c) => (
              <Chip
                key={c.status}
                label={c.label}
                Zeichen={c.Zeichen}
                farbe={c.farbe}
                count={zahl(c.status)}
                aktiv={status === c.status}
                onClick={() => setStatus(status === c.status ? "all" : c.status)}
              />
            ))}
          </div>

          {/* Gibt als Erstes nach, wenn das Fenster schmal wird -- die Chips
              bleiben dafuer vollstaendig und in einer Zeile. Unter etwa
              1300 Breite schrumpft das Feld bis auf die Lupe, statt dass
              die Leiste umbricht oder etwas abgeschnitten wird. */}
          <div className="ml-auto relative min-w-[40px] flex-1 max-w-[230px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a9ad]" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Search productions..."
              className="w-full h-[34px] pl-8 pr-3 rounded-lg surface-field text-[12px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
            />
          </div>
        </div>

        {creatorOpen && (
          <div
            onMouseLeave={() => setCreatorOpen(false)}
            className="absolute left-[7px] top-[54px] z-30 w-[200px] rounded-lg surface-panel-strong p-1 animate-fade-in max-h-72 overflow-y-auto"
          >
            <button
              onClick={() => {
                setCreatorId("all");
                setCreatorOpen(false);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
            >
              All Creators
            </button>
            {creators.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCreatorId(c.id);
                  setCreatorOpen(false);
                }}
                className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
                  style={c.profileImage ? undefined : { background: c.avatarColor }}
                >
                  {c.profileImage && <img src={c.profileImage} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        </div>

        {alleZeilen.length === 0 ? (
          <div className={`relative mt-4 ${PANEL} py-16 text-center`} style={PANEL_STYLE}>
            <Clapperboard size={20} className="mx-auto text-neutral-700 mb-2" />
            <p className="text-[13px] text-neutral-400">Nothing sent to ReelForge yet.</p>
            <p className="text-[12px] text-neutral-600 mt-1">
              Send a collection from its workspace and it'll show up here.
            </p>
          </div>
        ) : (
          <div className="relative mt-4 flex items-start gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <Panel
                icon={<AlertTriangle size={15} className="text-[#f2a633]" />}
                titel="Needs Attention"
                titelFarbe="#f1a846"
                unter="Items that need your input to keep production moving."
                rechts={<span className="text-[11px] text-[#9a9ba0]">View all ›</span>}
                leer="Nothing is waiting on you right now."
                anzahl={aufmerksam.length}
              >
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {aufmerksam.map((r) => (
                    <AufmerksamKarte key={r.submissionId} row={r} onOpen={() => onOpenCollection(r.collectionId)} />
                  ))}
                </div>
              </Panel>

              <Panel
                icon={<Activity size={15} strokeWidth={2.2} className="text-[#f2a633]" />}
                titel="Production Pipeline"
                titelFarbe="#f1a846"
                unter="Active production items, from first cut to final delivery."
                rechts={<span className="text-[11px] text-[#aaaab0]">Sort: Updated (newest)</span>}
                leer="Nothing in production right now."
                anzahl={laufend.length}
              >
                <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                  {laufend.map((r) => (
                    <PipelineZeile key={r.submissionId} row={r} onOpen={() => onOpenCollection(r.collectionId)} />
                  ))}
                </div>
              </Panel>
            </div>

            <div className="w-[360px] shrink-0 flex flex-col gap-3">
              <Panel
                icon={<CheckCircle2 size={15} className="text-[#31c98c]" />}
                titel="Finished"
                titelFarbe="#3fd096"
                unter="Recently completed and delivered content."
                rechts={<span className="text-[11px] text-[#9a9ba0]">View all ›</span>}
                leer="Nothing delivered yet."
                anzahl={fertig.length}
              >
                <div className="flex flex-col">
                  {fertig.map((r) => (
                    <SeitenZeile key={r.submissionId} row={r} onOpen={() => onOpenCollection(r.collectionId)} />
                  ))}
                </div>
              </Panel>

              <Panel
                icon={<Ban size={15} className="text-[#ff474d]" />}
                titel="Cancelled"
                titelFarbe="#ff5358"
                unter="Recently cancelled or archived items."
                rechts={<span className="text-[11px] text-[#9a9ba0]">View all ›</span>}
                leer="Nothing cancelled."
                anzahl={abgebrochen.length}
              >
                <div className="flex flex-col">
                  {abgebrochen.map((r) => (
                    <SeitenZeile key={r.submissionId} row={r} onOpen={() => onOpenCollection(r.collectionId)} />
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </Auftritt>
    </div>
  );
}

// Figma 3373:646 ff. — h 35, px 11, r 18, Zahl in einer Pille #292a2e.
function Chip({
  label,
  count,
  aktiv,
  Zeichen,
  farbe,
  onClick,
}: {
  label: string;
  count: number;
  aktiv: boolean;
  Zeichen?: typeof Circle;
  farbe?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-[30px] px-2 rounded-full flex items-center gap-1.5 text-[11px] whitespace-nowrap shrink-0 transition-colors duration-150",
        aktiv ? "border border-[#af7427] text-[#ffd18a]" : "text-[#c4c4c8] hover:bg-white/[0.04]",
      ].join(" ")}
      style={
        aktiv
          ? {
              backgroundImage: "linear-gradient(to right, #5a3b1f, #241d16)",
              filter: "drop-shadow(0 0 7.5px rgba(243,162,56,0.12))",
            }
          : undefined
      }
    >
      {Zeichen && <Zeichen size={11} strokeWidth={2} className="shrink-0" style={{ color: farbe }} />}
      {label}
      <span className="h-[17px] min-w-[17px] px-1.5 rounded-full bg-[#292a2e] text-[10px] text-[#bfc0c4] flex items-center justify-center">
        {count}
      </span>
    </button>
  );
}

// Figma 3373:688 / 3373:931 — Rahmen #26221c, Radius 13, Verlauf 144,8 Grad.
function Panel({
  icon,
  titel,
  titelFarbe,
  unter,
  rechts,
  leer,
  anzahl,
  children,
}: {
  icon: React.ReactNode;
  titel: string;
  titelFarbe: string;
  unter: string;
  // Rechts oben im Panel — im Entwurf "View all ›" bzw. der Sortierhinweis.
  rechts?: React.ReactNode;
  leer: string;
  anzahl: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`${PANEL} px-3 py-3`} style={PANEL_STYLE}>
      <div className="flex items-start gap-2.5 pb-3.5">
        <span className="shrink-0 leading-none pt-[1px]">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-[13px] tracking-[2px] uppercase font-semibold" style={{ color: titelFarbe }}>
            {titel}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#818287]">{unter}</p>
        </div>
        {rechts && <span className="ml-auto shrink-0 pl-2 pt-0.5 whitespace-nowrap">{rechts}</span>}
      </div>
      {anzahl === 0 ? <p className="py-6 text-center text-[12px] text-[#818287]">{leer}</p> : children}
    </div>
  );
}

function Bild({ row, klasse }: { row: ProductionRow; klasse: string }) {
  return (
    <span className={`${klasse} shrink-0 overflow-hidden bg-black/30 block`}>
      {row.thumbnailUrl ? (
        <img src={row.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="block w-full h-full" style={{ background: row.thumbGradient ?? DEFAULT_THUMB_GRADIENT }} />
      )}
    </span>
  );
}

function CreatorZeile({ row, grosse }: { row: ProductionRow; grosse: number }) {
  if (!row.creator) return null;
  return (
    <span className="flex items-center gap-[6px] min-w-0">
      <span
        className="rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
        style={{
          width: grosse,
          height: grosse,
          ...(row.creator.profileImage ? {} : { background: row.creator.avatarColor }),
        }}
      >
        {row.creator.profileImage && (
          <img src={row.creator.profileImage} alt="" className="w-full h-full object-cover" />
        )}
      </span>
      <span className="truncate text-[10px] text-[#9d9ea3]">{row.creator.name}</span>
    </span>
  );
}

// Die Quelle ist im Bestand nicht je Auftrag gespeichert -- aber sie ist auch
// nicht offen: was hier steht, wurde an ReelForge geschickt (der Weg zu
// Sydney laeuft ueber eine eigene Tabelle). Das Schild sagt also die
// Wahrheit, statt eine Quelle zu erfinden.
function QuellenSchild() {
  return (
    <span className="h-[26px] min-w-[86px] px-3 rounded-[9px] bg-[#171820] flex items-center justify-center gap-1.5 text-[10px] text-[#cfb6e7] shrink-0">
      <Sparkles size={11} className="text-[#cfb6e7]" />
      ReelForge
    </span>
  );
}

// Figma 3373:709 — Bild 68x73, Titel 14 halbfett, Hinweiszeile in #ff484d.
function AufmerksamKarte({ row, onOpen }: { row: ProductionRow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{ background: KARTE_FUELLUNG }}
      className={`relative text-left rounded-xl overflow-hidden transition-colors duration-150 ${ROW}`}
    >
      <span className="flex gap-2.5 p-2.5">
        <Bild row={row} klasse="w-[54px] h-[58px] rounded-[6px]" />
        <span className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
          <span className="text-[14px] font-semibold text-[#efeff2] truncate">{row.collectionName}</span>
          <span className="text-[11px] text-[#8c8d91]">
            {row.conceptCount} concept{row.conceptCount === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-2 pt-0.5 min-w-0">
            <CreatorZeile row={row} grosse={16} />
            <span className="ml-auto">
              <QuellenSchild />
            </span>
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2 px-2.5 py-1.5 border-t border-white/[0.06]">
        <AlertTriangle size={11} className="text-[#ff484d] shrink-0" />
        <span className="text-[10px] text-[#ff484d] truncate">{NAECHSTER_SCHRITT[row.status]}</span>
        <span className="ml-auto text-[10px] text-[#838489] shrink-0">{row.sentAt}</span>
      </span>
    </button>
  );
}

// Figma 3373:796 — Zeilenraster 39/14/14/27/6, Hoehe 60, Bild 77x49.
function PipelineZeile({ row, onOpen }: { row: ProductionRow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{ background: KARTE_FUELLUNG }}
      className="w-full h-[48px] px-2 grid items-center gap-2.5 border-b border-white/[0.06] last:border-b-0 text-left hover:bg-[#161613] transition-colors duration-150 [grid-template-columns:39fr_14fr_14fr_27fr_6fr]"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Bild row={row} klasse="w-[62px] h-[40px] rounded-[5px]" />
        <span className="min-w-0 flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-[#efeff2] truncate">{row.collectionName}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-[#8c8d91] shrink-0">{row.conceptCount} concepts</span>
            <span className="text-[#4f5054]">•</span>
            <CreatorZeile row={row} grosse={16} />
          </span>
        </span>
      </span>

      <span className="min-w-0">
        <QuellenSchild />
      </span>

      <StatusPille status={row.status} />

      <span className="text-[11px] leading-[17px] text-[#a9aaae] min-w-0">
        <span className="block truncate">{NAECHSTER_SCHRITT[row.status]}</span>
        <span className="block truncate">{row.eta ? `ETA ${row.eta}` : row.sentAt}</span>
      </span>

      <span className="text-right text-[13px] tracking-[1px] text-[#6d6e73]">···</span>
    </button>
  );
}

// Figma 3373:944 — Zeile 71 hoch, Bild 50x52, Titel 12, Trennlinie #202226.
function SeitenZeile({ row, onOpen }: { row: ProductionRow; onOpen: () => void }) {
  const st = STATUS_TEXT[row.status];
  return (
    <button
      onClick={onOpen}
      className="h-[58px] flex items-center gap-2.5 border-b border-white/[0.06] last:border-b-0 text-left hover:bg-white/[0.03] transition-colors duration-150"
    >
      <Bild row={row} klasse="w-[40px] h-[44px] rounded-[5px]" />
      <span className="flex-1 min-w-0 pl-[2px]">
        <span className="block text-[12px] font-medium text-[#efeff2] truncate">{row.collectionName}</span>
        <span className="block pt-0.5">
          <CreatorZeile row={row} grosse={19} />
        </span>
        <span className="block text-[11px] text-[#8c8d91]">
          {row.conceptCount} concept{row.conceptCount === 1 ? "" : "s"}
        </span>
      </span>
      <span className="shrink-0 flex flex-col items-end gap-0.5 pr-0.5">
        <span className="flex items-center gap-[5px] text-[10px]" style={{ color: st.color }}>
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: st.color }} />
          {st.label}
        </span>
        <span className="text-[10px] text-[#838489]">{row.sentAt}</span>
      </span>
    </button>
  );
}
