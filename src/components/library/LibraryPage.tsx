import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Download,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Library as LibraryIcon,
  MonitorSmartphone,
  MoreVertical,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import type { Collection, Creator, RegenerationReason } from "../../types";
import { DriveGlyph } from "../collections/DriveGlyph";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { FinishedBatchView } from "./FinishedBatchView";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { GOLD_RING, GOLD_RING_SOFT } from "../../lib/goldRing";

// Umsetzung des Referenzbildes (Figma 3378:3 traegt nur dieses Bild, keine
// Ebenen -- die Masse sind also am Bild abgelesen und auf den Massstab der
// uebrigen Seiten gebracht, nicht aus Figma ausgelesen). Flaechen, Rahmen,
// Schatten und der Sternenhimmel kommen aus der bestehenden DNA
// (Dashboard -> Research Accounts -> Collections -> Production), damit die
// Seite nicht aus der App faellt.
//
// Wo das Bild etwas zeigt, das es im Bestand nicht gibt, steht es an Ort
// und Stelle dabei. Nichts davon wurde erfunden.

// MASSSTAB: Der Entwurf ist fuer 1672 Punkte Fensterbreite gezeichnet,
// gearbeitet wird bei rund 1509 -- aus Emres Screenshot zurueckgerechnet
// (die Seitenleiste ist 215 Punkte breit und misst dort 285 von 2000).
// Sein Inhaltsbereich hat damit 1294 statt 1434 Punkte. Feste Masse aus dem
// Entwurf fuellen dort 10 Prozent mehr Flaeche und wirken herangezoomt;
// deshalb sind Schriften, Zeilenhoehen, Kaesten und Panelbreite hier mit
// 0,9 auf diese Breite gebracht. Die Verhaeltnisse des Entwurfs bleiben.
//
// Alle Flaechen- und Randwerte hier sind am Referenzbild gemessen (1672x941,
// also fast Bildpunkt fuer Bildpunkt dieselbe Breite wie die App bei 1671):
//
//   Seitenhintergrund      #010304
//   Filterleiste           Fuellung #060606, Rand #16120c (warm), 76 hoch
//   Zeile                  Fuellung #040608, Rand #0f1112
//   Zeile ausgewaehlt      Rand #77582f, Fuellung #080809
//   rechtes Panel          Fuellung #060809, Rand #0f1112, 510 breit
//
// Der Punkt, den das Bild macht und den die erste Fassung verfehlt hat: die
// Tiefe kommt aus duennen Linien auf fast schwarzem Grund, nicht aus grauen
// Flaechen. Vorher lagen die Zeilen auf #111114 und schwammen als graue
// Bloecke; jetzt traegt sie der Rand.
const PANEL = "rounded-xl border border-[#16120c]";
const PANEL_STYLE = {
  background: "#060606",
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02), 0 16px 32px -18px rgba(0,0,0,0.8), ${GOLD_RING}`,
} as const;

const GOLD_CTA = {
  backgroundImage: "linear-gradient(90deg, #D39448, #EAC088)",
  boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)",
} as const;

type Sortierung = "newest" | "oldest" | "assets";

const SORTIERUNGEN: { wert: Sortierung; label: string }[] = [
  { wert: "newest", label: "Newest" },
  { wert: "oldest", label: "Oldest" },
  { wert: "assets", label: "Most assets" },
];

interface Vorschau {
  id: string;
  thumbnailUrl?: string;
  thumbGradient?: string;
  duration: string;
}

interface Lieferung {
  submissionId: string;
  index: number;
  sentAt: string;
  datum: string;
  uhrzeit: string;
  deliveryUrl?: string;
  collectionId: string;
  collectionName: string;
  conceptCount: number;
  previews: Vorschau[];
  creator?: Creator;
  favorited: boolean;
  approvedAt?: string;
  // Woher der Stapel stammt. Der Entwurf zeigt hier drei Quellen; im
  // Bestand gibt es nur die Herkunft, die beim Speichern eines Konzepts
  // mitgeschrieben wurde (sourceLabel). Steht dort nichts, bleibt es bei
  // "ReelForge" -- das stimmt fuer jede ausgelieferte Charge.
  quelle: string;
}

function quelleVonStapel(label?: string): string {
  if (!label) return "ReelForge";
  if (label.toLowerCase().includes("drive")) return "Drive";
  return label;
}

function QuellenZeichen({ quelle, size = 12 }: { quelle: string; size?: number }) {
  if (quelle === "Drive") return <DriveGlyph size={size} />;
  if (quelle === "ReelForge") return <Sparkles size={size} />;
  return <MonitorSmartphone size={size} />;
}

// Kachel mit echtem Bild, sonst dem gespeicherten Verlauf.
function Kachel({ v, klasse }: { v?: Vorschau; klasse: string }) {
  const [fehlt, setFehlt] = useState(false);
  if (!v) return <span className={`${klasse} block bg-white/[0.03]`} />;
  if (v.thumbnailUrl && !fehlt) {
    return (
      <img
        src={v.thumbnailUrl}
        alt=""
        loading="lazy"
        onError={() => setFehlt(true)}
        className={`${klasse} block object-cover`}
      />
    );
  }
  return <span className={`${klasse} block`} style={{ background: v.thumbGradient ?? DEFAULT_THUMB_GRADIENT }} />;
}

// Auswahlfeld im Stil des Bildes: kleine Beschriftung oben, Wert darunter.
function Filterfeld({
  label,
  wert,
  breite,
  aktiv = true,
  titel,
  children,
  offen,
  setOffen,
}: {
  label: string;
  wert: string;
  breite: string;
  aktiv?: boolean;
  titel?: string;
  children?: React.ReactNode;
  offen?: boolean;
  setOffen?: (v: boolean) => void;
}) {
  return (
    <div className={`relative shrink-0 ${breite}`}>
      <button
        onClick={() => aktiv && setOffen?.(!offen)}
        title={titel}
        className={[
          "w-full h-[44px] px-3 rounded-lg border border-[#1b1d1f] bg-[#08090a] flex items-center gap-2 text-left transition-colors duration-150",
          aktiv ? "hover:border-[#D39448]/35" : "opacity-70 cursor-default",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px] text-[#77787d] leading-none">{label}</span>
          <span className="block mt-[3px] text-[12px] text-neutral-100 leading-none truncate">{wert}</span>
        </span>
        <ChevronDown size={13} className="shrink-0 text-[#939398]" />
      </button>
      {offen && children && (
        <div className="absolute left-0 top-[50px] z-30 w-full min-w-[170px] rounded-lg surface-panel-strong p-1 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function Menuepunkt({ label, gewaehlt, onClick }: { label: string; gewaehlt: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors",
        gewaehlt ? "text-neutral-100 bg-white/[0.06]" : "text-neutral-300 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function LibraryPage({
  creators,
  collections,
  onRequestRegeneration,
  onToggleFavorite,
  onApprove,
  onUploadFinishedVideo,
}: {
  creators: Creator[];
  collections: Collection[];
  onRequestRegeneration: (
    collectionId: string,
    submissionIndex: number,
    conceptId: string,
    reason: RegenerationReason,
    note: string
  ) => void;
  onToggleFavorite: (collectionId: string, submissionId: string, favorited: boolean) => void;
  onApprove: (collectionId: string, submissionId: string) => void;
  onUploadFinishedVideo: (collectionId: string, conceptId: string, file: File) => Promise<{ error: string | null }>;
}) {
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [creatorId, setCreatorId] = useState<string | "all">("all");
  const [status, setStatus] = useState<"all" | "approved" | "delivered">("all");
  const [sortierung, setSortierung] = useState<Sortierung>("newest");
  const [offen, setOffen] = useState<string | null>(null);
  const [menueId, setMenueId] = useState<string | null>(null);

  // Ein Druck irgendwo sonst schliesst die offenen Menues.
  useEffect(() => {
    if (!offen && !menueId) return;
    function beiDruck(e: PointerEvent) {
      if (!(e.target as HTMLElement).closest("[data-menue]")) {
        setOffen(null);
        setMenueId(null);
      }
    }
    document.addEventListener("pointerdown", beiDruck);
    return () => document.removeEventListener("pointerdown", beiDruck);
  }, [offen, menueId]);

  const alle: Lieferung[] = useMemo(
    () =>
      collections.flatMap((c) =>
        c.submissions
          .filter((s) => s.status === "Finished")
          .map((s) => {
            const konzepte = c.concepts.filter((k) => s.conceptIds.includes(k.video.id));
            const [datum, uhrzeit] = s.sentAt.split(" · ");
            return {
              submissionId: s.id,
              index: s.index,
              sentAt: s.sentAt,
              datum: datum ?? s.sentAt,
              uhrzeit: uhrzeit ?? "",
              deliveryUrl: s.deliveryUrl,
              collectionId: c.id,
              collectionName: c.name,
              conceptCount: s.conceptIds.length,
              previews: konzepte.map((k) => ({
                id: k.video.id,
                thumbnailUrl: k.video.thumbnailUrl,
                thumbGradient: k.video.thumbGradient ?? DEFAULT_THUMB_GRADIENT,
                duration: k.video.duration,
              })),
              creator: creators.find((cr) => cr.id === c.creatorId),
              favorited: s.favorited,
              approvedAt: s.approvedAt,
              quelle: quelleVonStapel(konzepte.find((k) => k.sourceLabel)?.sourceLabel),
            };
          })
      ),
    [collections, creators]
  );

  const sichtbar = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    const gefiltert = alle.filter((b) => {
      if (creatorId !== "all" && b.creator?.id !== creatorId) return false;
      if (status === "approved" && !b.approvedAt) return false;
      if (status === "delivered" && b.approvedAt) return false;
      if (!begriff) return true;
      return (
        b.collectionName.toLowerCase().includes(begriff) ||
        (b.creator?.name ?? "").toLowerCase().includes(begriff)
      );
    });
    return [...gefiltert].sort((a, b) => {
      if (sortierung === "assets") return b.conceptCount - a.conceptCount;
      const richtung = a.sentAt.localeCompare(b.sentAt);
      return sortierung === "oldest" ? richtung : -richtung;
    });
  }, [alle, creatorId, status, suche, sortierung]);

  const aktiv = sichtbar.find((b) => b.submissionId === gewaehlt) ?? sichtbar[0];

  // Der Finished-View bleibt unveraendert die schreibgeschuetzte Ansicht
  // einer Charge -- nie der Collection-Editor.
  if (openSubmissionId) {
    const collection = collections.find((c) => c.submissions.some((s) => s.id === openSubmissionId));
    const submission = collection?.submissions.find((s) => s.id === openSubmissionId);
    if (collection && submission) {
      return (
        <FinishedBatchView
          collection={collection}
          submission={submission}
          creator={creators.find((cr) => cr.id === collection.creatorId)}
          onBack={() => setOpenSubmissionId(null)}
          onRequestRegeneration={(conceptId, reason, note) =>
            onRequestRegeneration(collection.id, submission.index, conceptId, reason, note)
          }
          onUploadFinishedVideo={(conceptId, file) => onUploadFinishedVideo(collection.id, conceptId, file)}
          onToggleFavorite={() => onToggleFavorite(collection.id, submission.id, !submission.favorited)}
          onApprove={() => onApprove(collection.id, submission.id)}
        />
      );
    }
    setOpenSubmissionId(null);
  }

  const aktiverCreator = creators.find((c) => c.id === creatorId);

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203" }}>
      <style>{`
        .rf-library-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-library-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>

      {/* Im Entwurf laeuft der Inhalt von 252 bis 1648, also mit rund 14
          Punkten Abstand zur Seitenleiste statt der 40, die Collections und
          Production benutzen. Mit dem engeren Container blieb fuer die Titel
          zu wenig Platz und sie wurden abgeschnitten -- gemessen: 127 statt
          der noetigen 165. Deshalb hier die Geometrie des Entwurfs. Die
          Seite steht damit etwas weiter links als ihre Nachbarn. */}
      <div className="relative max-w-[1900px] mx-auto px-6 xl:px-8 pt-8 pb-8">
        <div className="dashboard-starfield-boost rf-library-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>

        {/* Kopf — wie Collections und Production: 34px Ueberschrift,
            13px Unterzeile, Hauptknopf rechts im festgelegten Gold. */}
        <div className="relative flex items-start justify-between gap-6">
          <div className="min-w-0">
            <span className="block text-[11.5px] tracking-[0.22em] uppercase text-[#D39448] font-medium">Library</span>
            <h1 className="mt-1 font-serif font-medium text-[36px] tracking-[-0.6px] text-[#f2f0ef]">
              Your content, organized.
            </h1>
            <p className="mt-1.5 text-[13px] text-[#bdbdc1]">
              Every delivered batch, searchable, grouped, and ready to review.
            </p>
          </div>

          {/* Oeffnet den Drive-Ordner der neuesten Lieferung -- das ist die
              einzige Drive-Adresse, die es im Bestand gibt. Ohne Lieferung
              bleibt der Knopf sichtbar, aber ohne Ziel. */}
          <a
            href={sichtbar.find((b) => b.deliveryUrl)?.deliveryUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={sichtbar.some((b) => b.deliveryUrl) ? "Open the newest delivery folder in Drive" : "No delivery folder yet"}
            className="shrink-0 h-9 px-4 rounded-lg flex items-center gap-2 text-[12.5px] font-medium text-[#020508] hover:brightness-110 transition-[filter] duration-150 press-feedback"
            style={GOLD_CTA}
          >
            <FolderOpen size={14} strokeWidth={2.2} />
            Open Drive
          </a>
        </div>

        {/* Steuerleiste — Umschalter, Suche, Filter, Sortierung. */}
        {/* Leiste 76 hoch, innen 13 Luft, Kaesten 49 -- am Bild abgelesen. */}
        <div className={`relative mt-6 ${PANEL} px-3 py-[11px] flex items-center gap-2.5`} style={PANEL_STYLE}>
          {/* Der Entwurf zeigt einen zweiten Reiter "Assets". Eine
              Einzelbild-Ansicht gibt es im Bestand nicht; sie zu erfinden
              waere eine neue Seite. Der Umschalter bleibt deshalb sichtbar
              und sagt das beim Darueberfahren. */}
          <div className="shrink-0 h-[44px] p-1 rounded-lg border border-[#1b1d1f] bg-[#08090a] flex items-center gap-1">
            <span
              className="h-[34px] px-4 rounded-md flex items-center text-[12.5px] text-[#D39448] border border-[#D39448]/60 bg-[#D39448]/[0.16]"
            >
              Deliveries
            </span>
            <span
              title="Single-asset view isn't built yet"
              className="h-[34px] px-4 rounded-md flex items-center text-[12.5px] text-neutral-500 cursor-default select-none"
            >
              Assets
            </span>
          </div>

          <div className="relative flex-1 min-w-[120px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a8a9ad]" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Search deliveries, creators, or content..."
              className="w-full h-[44px] pl-10 pr-3 rounded-lg border border-[#1b1d1f] bg-[#08090a] text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
            />
          </div>

          <div data-menue>
            <Filterfeld
              label="Creator"
              wert={aktiverCreator?.name ?? "All"}
              breite="w-[114px]"
              offen={offen === "creator"}
              setOffen={(v) => setOffen(v ? "creator" : null)}
            >
              <Menuepunkt label="All" gewaehlt={creatorId === "all"} onClick={() => { setCreatorId("all"); setOffen(null); }} />
              {creators.map((c) => (
                <Menuepunkt
                  key={c.id}
                  label={c.name}
                  gewaehlt={creatorId === c.id}
                  onClick={() => { setCreatorId(c.id); setOffen(null); }}
                />
              ))}
            </Filterfeld>
          </div>

          {/* Content Type und Source: im Bestand gibt es weder Asset-Typen
              noch eine gespeicherte Quelle je Charge, nach der sich filtern
              liesse. Beide bleiben sichtbar, ohne etwas vorzutaeuschen. */}
          <Filterfeld label="Content Type" wert="All" breite="w-[114px]" aktiv={false} titel="Asset types aren't tracked yet" />
          <Filterfeld label="Source" wert="All" breite="w-[115px]" aktiv={false} titel="Per-delivery source isn't tracked yet" />

          <div data-menue>
            <Filterfeld
              label="Status"
              wert={status === "all" ? "All" : status === "approved" ? "Approved" : "Delivered"}
              breite="w-[115px]"
              offen={offen === "status"}
              setOffen={(v) => setOffen(v ? "status" : null)}
            >
              <Menuepunkt label="All" gewaehlt={status === "all"} onClick={() => { setStatus("all"); setOffen(null); }} />
              <Menuepunkt label="Approved" gewaehlt={status === "approved"} onClick={() => { setStatus("approved"); setOffen(null); }} />
              <Menuepunkt label="Delivered" gewaehlt={status === "delivered"} onClick={() => { setStatus("delivered"); setOffen(null); }} />
            </Filterfeld>
          </div>

          <div data-menue>
            <Filterfeld
              label="Sort by"
              wert={SORTIERUNGEN.find((s) => s.wert === sortierung)?.label ?? "Newest"}
              breite="w-[175px]"
              offen={offen === "sort"}
              setOffen={(v) => setOffen(v ? "sort" : null)}
            >
              {SORTIERUNGEN.map((s) => (
                <Menuepunkt
                  key={s.wert}
                  label={s.label}
                  gewaehlt={sortierung === s.wert}
                  onClick={() => { setSortierung(s.wert); setOffen(null); }}
                />
              ))}
            </Filterfeld>
          </div>
        </div>

        <p className="relative mt-5 text-[12.5px] text-[#9a9ba0]">
          {sichtbar.length} deliver{sichtbar.length === 1 ? "y" : "ies"}
        </p>

        {sichtbar.length === 0 ? (
          <div className={`relative mt-3 ${PANEL} py-16 text-center`} style={PANEL_STYLE}>
            <LibraryIcon size={20} className="mx-auto text-neutral-700 mb-2" />
            <p className="text-[13px] text-neutral-400">Nothing delivered yet.</p>
            <p className="text-[12px] text-neutral-600 mt-1">Finished submissions show up here automatically.</p>
          </div>
        ) : (
          <div className="relative mt-3 flex flex-col min-[1440px]:flex-row items-stretch min-[1440px]:items-start gap-4">
            {/* Linke Spalte: die Lieferungen */}
            {/* Im Bild gibt es KEINEN Kasten um die Liste -- die Zeilen stehen
                einzeln auf dem Seitenhintergrund, jede mit eigenem Rand.
                Abstand von Zeilenoberkante zu Zeilenoberkante: 106. */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {sichtbar.map((b) => {
                const ausgewaehlt = aktiv?.submissionId === b.submissionId;
                return (
                  <div
                    key={b.submissionId}
                    onClick={() => setGewaehlt(b.submissionId)}
                    className={[
                      "relative flex items-center gap-2 h-[88px] pl-3 pr-2 rounded-xl border transition-colors duration-150 cursor-pointer",
                      ausgewaehlt
                        ? "border-[#77582f] bg-[#080809]"
                        : "border-[#0f1112] bg-[#040608] hover:border-[#2b2419] hover:bg-[#090a0c]",
                    ].join(" ")}
                    style={{
                      boxShadow: ausgewaehlt
                        ? "0 0 0 1px rgba(119,88,47,0.35), 0 10px 26px -18px rgba(211,148,72,0.35)"
                        : GOLD_RING_SOFT,
                    }}
                  >
                    <span className="shrink-0 mr-2 flex gap-[2px] rounded-[7px] overflow-hidden bg-black/30">
                      <Kachel v={b.previews[0]} klasse="w-[71px] h-[69px]" />
                      <Kachel v={b.previews[1]} klasse="w-[71px] h-[69px]" />
                    </span>

                    <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <span className="flex items-baseline gap-1.5 min-w-0">
                        <span className="font-serif font-medium text-[15.5px] text-[#f2f0ef] truncate">
                          {b.collectionName}
                        </span>
                        <span className="text-[12.5px] text-[#6d6e73] shrink-0">·</span>
                        <span className="text-[12.5px] text-[#a9aaae] shrink-0">Batch #{b.index}</span>
                      </span>

                      <span className="flex items-center gap-1.5 min-w-0">
                        {b.creator && (
                          <span
                            className="w-[18px] h-[18px] rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
                            style={b.creator.profileImage ? undefined : { background: b.creator.avatarColor }}
                          >
                            {b.creator.profileImage && (
                              <img src={b.creator.profileImage} alt={b.creator.name} className="w-full h-full object-cover" />
                            )}
                          </span>
                        )}
                        <span className="text-[11.5px] text-[#a9aaae] truncate">{b.creator?.name ?? "Unknown creator"}</span>
                      </span>

                      <span className="text-[11px] text-[#8c8d91] truncate">
                        {b.conceptCount} asset{b.conceptCount === 1 ? "" : "s"}
                        <span className="px-1.5 text-[#4f5054]">·</span>
                        {b.sentAt}
                      </span>
                    </span>

                    <span className="shrink-0 h-[26px] px-2 rounded-[13px] flex items-center gap-1.5 border border-[#1e2023] bg-[#0b0c0e] text-[10.5px] text-[#c8c9ce]">
                      <QuellenZeichen quelle={b.quelle} />
                      {b.quelle}
                    </span>

                    <span
                      className="shrink-0 h-[26px] min-w-[76px] px-2 rounded-[13px] flex items-center justify-center gap-1.5 text-[10.5px]"
                      style={
                        b.approvedAt
                          ? { background: "radial-gradient(circle at 50% 50%, rgba(18,56,42,1) 0%, rgba(11,28,22,1) 100%)", color: "#3fd096", filter: "drop-shadow(0 0 8px rgba(35,208,150,0.14))" }
                          : { background: "radial-gradient(circle at 50% 50%, rgba(20,40,63,1) 0%, rgba(13,23,33,1) 100%)", color: "#5eb1ff", filter: "drop-shadow(0 0 8px rgba(35,132,231,0.14))" }
                      }
                    >
                      <span className="w-[6px] h-[6px] rounded-full" style={{ background: b.approvedAt ? "#3fd096" : "#5eb1ff" }} />
                      {b.approvedAt ? "Approved" : "Delivered"}
                    </span>

                    <span aria-hidden className="shrink-0 self-stretch w-px my-3.5 bg-[#161819]" />
                    <span className="shrink-0 flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenSubmissionId(b.submissionId); }}
                        title="Open this delivery"
                        className="w-[48px] h-[46px] rounded-lg flex flex-col items-center justify-center gap-1 text-[#c8c9ce] hover:text-neutral-50 hover:bg-white/[0.05] transition-colors duration-150"
                      >
                        <Play size={14} />
                        <span className="text-[9.5px]">Open</span>
                      </button>
                      <a
                        href={b.deliveryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => { e.stopPropagation(); if (!b.deliveryUrl) e.preventDefault(); }}
                        title={b.deliveryUrl ? "Open in Drive" : "No Drive folder for this delivery"}
                        className={[
                          "w-[48px] h-[46px] rounded-lg flex flex-col items-center justify-center gap-1 transition-colors duration-150",
                          b.deliveryUrl ? "text-[#c8c9ce] hover:text-neutral-50 hover:bg-white/[0.05]" : "text-[#5a5b60] cursor-default",
                        ].join(" ")}
                      >
                        <DriveGlyph size={14} />
                        <span className="text-[9.5px]">Drive</span>
                      </a>
                      {/* Ein eigener Download aus dem Client OS heraus gibt
                          es noch nicht -- die Dateien liegen in Drive. */}
                      <span
                        title="Download runs through the Drive folder for now"
                        className="w-[48px] h-[46px] rounded-lg flex flex-col items-center justify-center gap-1 text-[#5a5b60] cursor-default select-none"
                      >
                        <Download size={14} />
                        <span className="text-[9.5px]">Download</span>
                      </span>
                    </span>

                    <span aria-hidden className="shrink-0 self-stretch w-px my-3.5 bg-[#161819]" />
                    <span className="relative shrink-0" data-menue onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setMenueId(menueId === b.submissionId ? null : b.submissionId)}
                        aria-label="Delivery actions"
                        className="w-6 h-7 rounded-md flex items-center justify-center text-[#6d6e73] hover:text-neutral-100 transition-colors duration-150"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {menueId === b.submissionId && (
                        <span className="absolute right-0 top-8 z-30 w-44 block rounded-lg surface-panel-strong p-1 animate-fade-in">
                          <button
                            onClick={() => { setMenueId(null); onToggleFavorite(b.collectionId, b.submissionId, !b.favorited); }}
                            className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                          >
                            <Heart size={12} fill={b.favorited ? "currentColor" : "none"} className={b.favorited ? "text-rose-400" : ""} />
                            {b.favorited ? "Remove favorite" : "Favorite"}
                          </button>
                          {!b.approvedAt && (
                            <button
                              onClick={() => { setMenueId(null); onApprove(b.collectionId, b.submissionId); }}
                              className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                            >
                              <CheckCircle2 size={12} />
                              Approve delivery
                            </button>
                          )}
                          <button
                            onClick={() => { setMenueId(null); setOpenSubmissionId(b.submissionId); }}
                            className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] text-neutral-300 hover:bg-white/[0.06] transition-colors"
                          >
                            <Play size={12} />
                            Open delivery
                          </button>
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Rechte Spalte: die gewaehlte Lieferung im Detail */}
            {aktiv && (
              <div
                className="w-full min-[1440px]:w-[460px] shrink-0 rounded-xl border border-[#0f1112] p-3"
                style={{ background: "#060809", boxShadow: GOLD_RING }}
              >
                <div className="grid grid-cols-2 gap-[3px] rounded-[10px] overflow-hidden bg-black/30">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Kachel key={i} v={aktiv.previews[i]} klasse="w-full h-[104px]" />
                  ))}
                </div>

                <div className="mt-3.5 flex items-center gap-2">
                  <h2 className="min-w-0 flex items-baseline gap-1.5">
                    <span className="font-serif font-medium text-[15.5px] text-[#f2f0ef] truncate">{aktiv.collectionName}</span>
                    <span className="text-[14px] text-[#6d6e73] shrink-0">·</span>
                    <span className="text-[14px] text-[#a9aaae] shrink-0">Batch #{aktiv.index}</span>
                  </h2>
                  <span
                    className="ml-auto shrink-0 h-[24px] px-2.5 rounded-[12px] flex items-center gap-1.5 text-[10.5px]"
                    style={
                      aktiv.approvedAt
                        ? { background: "radial-gradient(circle at 50% 50%, rgba(18,56,42,1) 0%, rgba(11,28,22,1) 100%)", color: "#3fd096" }
                        : { background: "radial-gradient(circle at 50% 50%, rgba(20,40,63,1) 0%, rgba(13,23,33,1) 100%)", color: "#5eb1ff" }
                    }
                  >
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: aktiv.approvedAt ? "#3fd096" : "#5eb1ff" }} />
                    {aktiv.approvedAt ? "Approved" : "Delivered"}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  {aktiv.creator && (
                    <span
                      className="w-[26px] h-[26px] rounded-full shrink-0 overflow-hidden ring-1 ring-white/10"
                      style={aktiv.creator.profileImage ? undefined : { background: aktiv.creator.avatarColor }}
                    >
                      {aktiv.creator.profileImage && (
                        <img src={aktiv.creator.profileImage} alt={aktiv.creator.name} className="w-full h-full object-cover" />
                      )}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-[#efeff2] truncate">{aktiv.creator?.name ?? "Unknown creator"}</span>
                    {aktiv.creator?.handle && (
                      <span className="block text-[11px] text-[#8c8d91] truncate">{aktiv.creator.handle}</span>
                    )}
                  </span>
                </div>

                {/* Kennzahlen — vier Felder mit Trennlinien, wie im Bild. */}
                <div className="mt-3.5 pt-3.5 border-t border-[#131516] flex items-center">
                  {[
                    { Zeichen: Clapperboard, wert: String(aktiv.conceptCount), label: "Assets" },
                    { Zeichen: CalendarDays, wert: aktiv.datum, label: aktiv.uhrzeit || "Delivered" },
                    { Zeichen: () => <QuellenZeichen quelle={aktiv.quelle} size={13} />, wert: aktiv.quelle, label: "Source" },
                    { Zeichen: CheckCircle2, wert: aktiv.approvedAt ? "Approved" : "Delivered", label: "Status" },
                  ].map((z, i) => (
                    <div key={i} className={`flex items-center gap-2 min-w-0 ${i > 0 ? "pl-3 ml-3 border-l border-[#1a1d1e]" : ""}`}>
                      <span className="shrink-0 text-[#8c8d91]">
                        <z.Zeichen size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] text-[#efeff2] truncate">{z.wert}</span>
                        <span className="block text-[10px] text-[#818287] truncate">{z.label}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3.5 flex items-center gap-2">
                  <button
                    onClick={() => setOpenSubmissionId(aktiv.submissionId)}
                    className="flex-1 h-9 rounded-lg flex items-center justify-center gap-2 text-[12.5px] font-medium text-[#020508] hover:brightness-110 transition-[filter] duration-150 press-feedback"
                    style={GOLD_CTA}
                  >
                    <Play size={13} strokeWidth={2.4} />
                    Open Delivery
                  </button>
                  <a
                    href={aktiv.deliveryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { if (!aktiv.deliveryUrl) e.preventDefault(); }}
                    title={aktiv.deliveryUrl ? "Open in Drive" : "No Drive folder for this delivery"}
                    className={[
                      "flex-1 h-9 rounded-lg flex items-center justify-center gap-2 border border-white/[0.08] bg-[#111114] text-[12.5px] transition-colors duration-150",
                      aktiv.deliveryUrl ? "text-neutral-50 hover:border-[#D39448]/35 hover:bg-[#D39448]/[0.05] press-feedback" : "text-[#5a5b60] cursor-default",
                    ].join(" ")}
                  >
                    <DriveGlyph size={13} />
                    Open in Drive
                  </a>
                  <span
                    title="Download runs through the Drive folder for now"
                    className="flex-1 h-9 rounded-lg flex items-center justify-center gap-2 border border-white/[0.08] bg-[#111114] text-[12.5px] text-[#5a5b60] cursor-default select-none"
                  >
                    <Download size={13} />
                    Download ZIP
                  </span>
                </div>

                <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center">
                  <h3 className="text-[11px] tracking-[1.6px] uppercase text-[#a9aaae]">Included Assets</h3>
                  <button
                    onClick={() => setOpenSubmissionId(aktiv.submissionId)}
                    className="ml-auto text-[11px] text-[#9a9ba0] hover:text-neutral-100 transition-colors duration-150"
                  >
                    View all {aktiv.conceptCount} ›
                  </button>
                </div>

                {/* Der Entwurf teilt in Reels und Stills. Im Bestand ist jede
                    Lieferung ein Reel -- Standbilder gibt es als Typ nicht,
                    deshalb steht dort ehrlich 0 statt einer erfundenen Zahl. */}
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <div className="h-[52px] px-3 rounded-lg border border-white/[0.07] bg-[#111114] flex items-center gap-2.5">
                    <Clapperboard size={15} className="shrink-0 text-[#8c8d91]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-[#efeff2]">Reels</span>
                      <span className="block text-[10px] text-[#818287] truncate">Vertical videos (9:16)</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-[#efeff2]">{aktiv.conceptCount}</span>
                  </div>
                  <div className="h-[52px] px-3 rounded-lg border border-white/[0.07] bg-[#111114] flex items-center gap-2.5">
                    <ImageIcon size={15} className="shrink-0 text-[#8c8d91]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-[#efeff2]">Stills</span>
                      <span className="block text-[10px] text-[#818287] truncate">Images &amp; thumbnails</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-[#efeff2]">0</span>
                  </div>
                </div>

                <h3 className="mt-4 text-[11px] tracking-[1.6px] uppercase text-[#a9aaae]">Recent Assets</h3>
                <div className="mt-2.5 grid grid-cols-5 gap-2">
                  {aktiv.previews.slice(0, 5).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setOpenSubmissionId(aktiv.submissionId)}
                      className="relative h-[68px] rounded-[7px] overflow-hidden border border-white/[0.07] hover:border-[#D39448]/35 transition-colors duration-150"
                    >
                      <Kachel v={v} klasse="w-full h-full" />
                      {/* Im Entwurf sitzt rechts oben ein kleines Zeichen und
                          die Laufzeit unten links -- nicht umgekehrt. */}
                      <span className="absolute right-1 top-1 w-[15px] h-[15px] rounded-[4px] bg-black/60 flex items-center justify-center text-[#dcdde1]">
                        <Clapperboard size={9} />
                      </span>
                      <span className="absolute left-1 bottom-1 px-1 rounded-[3px] bg-black/70 text-[9px] text-neutral-200">
                        {v.duration}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
