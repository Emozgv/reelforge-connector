import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Send,
  Clock,
  RotateCcw,
  PackageCheck,
  Inbox,
  ArchiveRestore,
  Loader2,
  Ban,
  Layers,
  CircleCheck,
  CalendarDays,
  Download,
  Ellipsis,
  LayoutGrid,
  List,
  Search,
  ChevronDown,
  ArrowRight,
  FileText,
  Users,
  ExternalLink,
  Activity,
  Target,
  SlidersHorizontal,
  Sparkles,
  Pencil,
  Upload,
  MessageSquare,
  CloudUpload,
  Flag,
  Video,
  XCircle,
} from "lucide-react";
import type {
  Collection,
  CollectionConcept,
  CollectionPriority,
  CollectionStatus,
  ConceptStatus,
  Creator,
  ReelVideo,
  SubmissionStatus,
} from "../../types";
import { formatRelativeTime } from "../../lib/relativeTime";
import { collectionFamily, isVersionableCollection, nextCollectionName } from "../../lib/collectionNaming";
import { resolveReelVideo } from "../../lib/searchReels";
import { KARTE_FUELLUNG } from "../../lib/panelLook";
import { KOPF_ABSTAND, KOPF_KUERZEL, KOPF_TITEL, KOPF_UNTERZEILE } from "../../lib/pageHeader";
import { ConceptGrid } from "./ConceptGrid";
import { conceptBadge } from "./ConceptCard";
import { SendToReelForgePanel } from "./SendToReelForgePanel";
import { SendToSydPanel } from "./SendToSydPanel";
import { DriveGlyph } from "./DriveGlyph";
import { effectiveCollectionStatus } from "./CollectionRow";
import { CollectionVersionMenu } from "./CollectionVersionMenu";
import { DeadlineKalender, deadlineAnzeige, deadlineKurz } from "./DeadlineKalender";
import { ReelDetailModal } from "../hub/ReelDetailModal";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { V3_KARTE, V3_KARTE_STIL, V3_KACHEL, V3_KACHEL_STIL, ZeichenFeld, GoldKnopf, RahmenKnopf, Auftritt, Zahl } from "../shared/v3";

// ===========================================================================
// Die Collection-Detailseite -- Neubau vom 12.11.2026 nach Emres Screenshot.
// ===========================================================================
//
// Der Screenshot ist die Vorlage fuer das Bild, der bestehende Code die
// Wahrheit fuer das Verhalten. Alles, was hier steht, haengt an echten Daten
// oder an den vorhandenen Handlungen (senden, Status setzen, Notizen, Creator
// zuweisen, Version wechseln, wieder oeffnen, wiederherstellen). Was der
// Screenshot zeigt, aber im Produkt nicht existiert, ist gezeichnet, sagt
// aber ehrlich, dass es nicht angebunden ist (Deadline, Export).
//
// Zuordnung Screenshot -> Produkt, damit niemand raten muss:
//   "Send to Creator"          -> Send to ReelForge (die echte Hauptaktion)
//   Production Progress        -> Anteile Used / Sent / Unused der Konzepte
//   Kennzahl-Karten            -> Total, Unused, Sent, Used, Rejected
//   Reiter Concepts/Timeline/Notes -> Raster / Uebergaben + Verlauf / Direction
//   Collection Brief           -> Direction & notes der Collection, darunter
//                                 vier Felder aus dem Creator-Profil
//   Assignment                 -> Creator der Collection, Deadline (nicht erfasst)
//   Timeline (rechts)          -> aus Verlauf und letzter Uebergabe abgeleitet
//   Recent Activity            -> die letzten zwei Eintraege des Verlaufs

// ReelForge produces in batches — a submission needs enough concepts to make
// a production run worthwhile. 10 is the floor; more is always fine.
const MIN_SEND_COUNT = 10;

// Production status is read-only for the client — ReelForge Internal owns it.
const SUBMISSION_STATUS_STYLES: Record<SubmissionStatus, string> = {
  Sent: "text-[#cfd3d9] border-white/[0.14] bg-white/[0.04]",
  "In Progress": "text-[#f2b552] border-[rgba(242,181,82,0.35)] bg-[rgba(242,181,82,0.10)]",
  "Check Inbox": "text-[#D39448] border-[rgba(211,148,72,0.45)] bg-[rgba(211,148,72,0.14)]",
  Cancelled: "text-[#8c877e] border-white/[0.10] bg-white/[0.03]",
  Finished: "text-[#63c07f] border-[rgba(99,192,127,0.35)] bg-[rgba(99,192,127,0.10)]",
};

// Die Statuspille der Collection: Farbe je Bedeutung, mit leuchtendem Punkt.
const COLLECTION_PILL: Record<CollectionStatus | "Cancelled" | "In Progress", { farbe: string; text: string }> = {
  Draft: { farbe: "#8c877e", text: "Draft" },
  Sent: { farbe: "#5eb1ff", text: "Sent" },
  "In Progress": { farbe: "#f2b552", text: "In Production" },
  Completed: { farbe: "#63c07f", text: "Completed" },
  Cancelled: { farbe: "#8c877e", text: "Cancelled" },
};

type Reiter = "concepts" | "timeline" | "notes" | "submitted";
type StatusFilter = "all" | ConceptStatus | "Sent";
type PlattformFilter = "all" | "instagram" | "tiktok";
type Sortierung = "recent" | "oldest" | "views";
type Ansicht = "raster" | "liste";

function Initialen({ creator, groesse }: { creator?: Creator; groesse: number }) {
  const bild = creator?.referencePhotos?.[0] ?? creator?.profileImage;
  const initialen = (creator?.name ?? "?")
    .split(" ")
    .map((t) => t[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 text-white font-semibold"
      style={{
        width: groesse,
        height: groesse,
        background: creator?.avatarColor ?? "#26262b",
        fontSize: Math.round(groesse * 0.36),
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {bild ? <img src={bild} alt="" className="absolute inset-0 w-full h-full object-cover" /> : initialen}
    </span>
  );
}

function Auswahl<T extends string>({
  wert,
  optionen,
  onChange,
  breite,
}: {
  wert: T;
  optionen: { wert: T; label: string }[];
  onChange: (w: T) => void;
  breite: number;
}) {
  return (
    <div className="relative shrink-0" style={{ width: breite }}>
      <select
        value={wert}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none w-full h-[44px] pl-3.5 pr-8 rounded-[10px] border border-[#1a130b] text-[13.5px] text-[#dcdcde] outline-none focus-glow cursor-pointer hover:border-[#2f2113] transition-colors duration-150"
        style={{ background: KARTE_FUELLUNG }}
      >
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert} className="bg-[#0d0d0f] text-[#dcdcde]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8c877e]" />
    </div>
  );
}

function PanelKopf({
  icon: Icon,
  titel,
  rechts,
}: {
  icon: typeof FileText;
  titel: string;
  rechts?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Icon size={15} className="text-[#D39448]" strokeWidth={1.9} />
        <h3 className="text-[13.5px] font-semibold text-[#f5f5f5] leading-[18px] tracking-[-0.1px]">{titel}</h3>
      </div>
      {rechts && (
        <button
          onClick={rechts.onClick}
          className="inline-flex items-center gap-1 text-[11px] text-[#D39448] hover:brightness-110 transition-[filter]"
        >
          {rechts.label}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

export function CollectionWorkspace({
  collection,
  workspaceId,
  creators,
  allCollections,
  saveError,
  siblingCollections,
  onBack,
  backLabel,
  onUpdateNotes,
  onSetPlanning,
  onReopen,
  onRemoveVideo,
  onSetConceptStatus,
  onSetConceptNotes,
  onSendSubmission,
  onStartNext,
  onSwitchCollection,
  onRestore,
  onReassignConcept,
  onAssignConceptToAnother,
  onOpenCreator,
  isSydOwner,
  onSendToSyd,
}: {
  // Nur fuer die Reel-Notiz im Player.
  workspaceId?: string;
  collection: Collection;
  creators: Creator[];
  // Every creator's collections, workspace-wide — needed to offer real
  // destination collections when assigning a concept to another creator
  // (siblingCollections below is only this collection's own version family).
  allCollections: Collection[];
  saveError?: string | null;
  siblingCollections: { id: string; name: string; status: CollectionStatus; submissions: Collection["submissions"] }[];
  onBack: () => void;
  backLabel: string;
  onUpdateNotes: (notes: string) => void;
  // Deadline und Prioritaet setzen (13.11.2026).
  onSetPlanning?: (patch: { deadline?: string | null; priority?: CollectionPriority | null }) => Promise<boolean> | void;
  // Status itself is never client-writable — Draft -> Sent happens
  // automatically when a submission goes out, and Sent -> Completed only
  // when ReelForge Internal marks the production finished. This is the one
  // deliberate exception: reopening a Completed Collection back to Draft for
  // a new round of work, without touching its existing submission history.
  onReopen: () => void;
  onRemoveVideo: (videoId: string) => void;
  onSetConceptStatus: (videoId: string, status: ConceptStatus) => void;
  onSetConceptNotes: (videoId: string, notes: string) => void;
  onSendSubmission: (note: string) => Promise<{ ok: boolean; error?: string }>;
  // The next version's name is always computed fresh by the store at the
  // moment of creation — this component only supplies a display preview.
  onStartNext: () => void;
  onSwitchCollection: (id: string) => void;
  // Present only when viewing this Collection from the Archive — restores
  // the whole family (every version) back to the active list together.
  onRestore?: () => void;
  onReassignConcept: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
  onAssignConceptToAnother: (videoId: string, targetCreatorId: string, targetCollectionId: string | undefined) => Promise<{ error: string | null }>;
  // Oeffnet das Creator-Profil (der Knopf im Assignment-Kasten).
  onOpenCreator?: (creatorId: string) => void;
  // Private SYD route — only ever shown to the Owner (see useSydAccess).
  // Entirely separate action from onSendSubmission: different table,
  // different destination, zero effect on the normal customer flow below.
  isSydOwner?: boolean;
  onSendToSyd?: (note: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const archived = !!collection.archivedAt;
  const [notes, setNotes] = useState(collection.notes);
  const [sendOpen, setSendOpen] = useState(false);
  const [sydOpen, setSydOpen] = useState(false);
  const [mehrOffen, setMehrOffen] = useState(false);
  // Welcher Kalender offen ist: der am Knopf oben oder der im Assignment-Kasten.
  const [kalender, setKalender] = useState<"kopf" | "kasten" | null>(null);
  const [prioMenue, setPrioMenue] = useState(false);
  const [reiter, setReiter] = useState<Reiter>("concepts");
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [plattformFilter, setPlattformFilter] = useState<PlattformFilter>("all");
  const [sortierung, setSortierung] = useState<Sortierung>("recent");
  const [ansicht, setAnsicht] = useState<Ansicht>("raster");
  const [inboxNoteId, setInboxNoteId] = useState<string | null>(null);
  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sucheRef = useRef<HTMLInputElement>(null);
  // A saved Concept never has its own play_addr persisted (TikTok's signed
  // CDN URLs expire in ~24-48h, so a stored one would eventually just 404)
  // — opening one for playback re-resolves it live from its sourceUrl, then
  // plays it in the exact same ReelDetailModal the Hub uses.
  const [detailConceptId, setDetailConceptId] = useState<string | null>(null);
  const [detailVideo, setDetailVideo] = useState<ReelVideo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const creator = creators.find((c) => c.id === collection.creatorId);
  const family = collectionFamily(collection.name, [
    { id: collection.id, name: collection.name, status: collection.status, submissions: collection.submissions },
    ...siblingCollections,
  ]);
  // Display preview only — the actual name is always recomputed fresh by the
  // store at creation time (see createNextVersion). Must include `family`'s
  // full set (which already includes this collection itself): the current
  // version already occupies its own slot (e.g. "Foo 2"), so a names list
  // that excluded it would suggest that same slot again.
  const suggestedName = nextCollectionName(collection.name, family.map((f) => f.name));

  useEffect(() => {
    return () => clearTimeout(notesSaveTimeout.current);
  }, []);

  function handleNotesChange(value: string) {
    setNotes(value);
    clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(() => onUpdateNotes(value), 500);
  }

  async function openConceptDetail(concept: CollectionConcept) {
    setDetailConceptId(concept.video.id);
    setDetailVideo(null);
    setDetailError(null);
    // KOPIE ZUERST (12.11.2026): hat das Konzept eine dauerhafte Videokopie,
    // spielt sie sofort -- ohne den Suchanbieter, der bei Instagram-
    // Research-Reels regelmaessig scheitert.
    if (concept.video.previewVideoUrl) {
      setDetailVideo({ ...concept.video, videoUrl: concept.video.previewVideoUrl, saved: true, used: concept.status === "Used" });
      return;
    }
    setDetailLoading(true);
    const { results, error } = await resolveReelVideo(concept.video.platform, concept.video.sourceUrl);
    setDetailLoading(false);
    if (error || results.length === 0) {
      // Kein Video zu bekommen: statt der rohen Anbietermeldung die
      // Reel-Ansicht mit Vorschaubild, Kennzahlen und "Watch on Instagram"
      // -- so wie das Archiv es bei abgelaufenen Videos auch macht.
      if (error) console.warn("[collections] video resolve failed:", error);
      setDetailVideo({ ...concept.video, videoUrl: undefined, saved: true, used: concept.status === "Used" });
      return;
    }
    // The resolved video's own id is a fresh `tt-<awemeId>` — keep the
    // Concept's real (DB row) id instead so prev/next indexing below still
    // matches it, and prefer the Concept's already-working thumbnail (the
    // resolve endpoint's own cover is HEIC-first and won't render in most
    // browsers) over the freshly resolved one.
    setDetailVideo({
      ...results[0],
      id: concept.video.id,
      thumbnailUrl: concept.video.thumbnailUrl ?? results[0].thumbnailUrl,
      thumbGradient: concept.video.thumbGradient,
      saved: true,
      used: concept.status === "Used",
    });
  }

  function closeConceptDetail() {
    setDetailConceptId(null);
    setDetailVideo(null);
    setDetailError(null);
  }

  // Submission membership lives only in client_os.submission_concepts — derive
  // it here from the fetched Submissions rather than a per-Concept array.
  const submittedConceptIds = useMemo(
    () => new Set(collection.submissions.flatMap((s) => s.conceptIds)),
    [collection.submissions]
  );
  const sendableConcepts = collection.concepts.filter((c) => c.status !== "Rejected");
  const overlapCount = sendableConcepts.filter((c) => submittedConceptIds.has(c.video.id)).length;
  // Which prior Submission(s) a resend would overlap with — shown in the warning
  // so the user knows what was already sent, not just how many concepts.
  const overlapSubmissionIndexes = [
    ...new Set(
      collection.submissions
        .filter((s) => s.conceptIds.some((id) => sendableConcepts.some((c) => c.video.id === id)))
        .map((s) => s.index)
    ),
  ];

  const latestSubmission =
    collection.submissions.length > 0 ? collection.submissions[collection.submissions.length - 1] : null;

  const belowMinimum = sendableConcepts.length < MIN_SEND_COUNT;
  const remainingToMinimum = MIN_SEND_COUNT - sendableConcepts.length;

  // Die Zahlen oben: jedes Konzept zaehlt genau einmal.
  const total = collection.concepts.length;
  const used = collection.concepts.filter((c) => c.status === "Used").length;
  const rejected = collection.concepts.filter((c) => c.status === "Rejected").length;
  const sent = collection.concepts.filter((c) => conceptBadge(c, submittedConceptIds.has(c.video.id)) === "Sent").length;
  const unused = total - used - rejected - sent;
  const ohneAbgelehnte = total - rejected;
  const balkenAnteil = (n: number) => (ohneAbgelehnte <= 0 ? 0 : Math.round((n / ohneAbgelehnte) * 100));

  const sichtbareKonzepte = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const list = collection.concepts.filter((c) => {
      const badge = conceptBadge(c, submittedConceptIds.has(c.video.id));
      if (statusFilter !== "all" && badge !== statusFilter) return false;
      if (plattformFilter !== "all" && c.video.platform !== plattformFilter) return false;
      if (q) {
        const heuhaufen = [c.video.username, c.notes, c.sourceLabel ?? "", c.video.caption ?? ""].join(" ").toLowerCase();
        if (!heuhaufen.includes(q)) return false;
      }
      return true;
    });
    // Der Bestand liegt mit dem Neuesten vorn (so legt der Store neue
    // Konzepte ab) -- "Most Recent" ist diese Reihenfolge.
    if (sortierung === "oldest") return [...list].reverse();
    if (sortierung === "views") return [...list].sort((a, b) => (b.video.viewsRaw ?? 0) - (a.video.viewsRaw ?? 0));
    return list;
  }, [collection.concepts, suche, statusFilter, plattformFilter, sortierung, submittedConceptIds]);
  const detailIndex = sichtbareKonzepte.findIndex((c) => c.video.id === detailConceptId);


  const status = effectiveCollectionStatus(collection);
  const pille = COLLECTION_PILL[status];
  const kannWiederOeffnen = !archived && (collection.status === "Completed" || status === "Cancelled");

  // Die Zeitleiste rechts: vier feste Stationen, abgeleitet aus dem, was wir
  // wirklich wissen (Verlauf, letzte Uebergabe). Kein eigener Zustand.
  const erstellt = collection.history.find((h) => /created/i.test(h.label)) ?? collection.history[0];
  const inProduktion =
    latestSubmission?.status === "In Progress" ||
    latestSubmission?.status === "Check Inbox" ||
    latestSubmission?.status === "Finished";
  const geliefert = latestSubmission?.status === "Finished";
  const zeitleiste: { label: string; zeit: string; zustand: "fertig" | "aktiv" | "offen" }[] = [
    { label: "Collection created", zeit: erstellt?.date ?? "—", zustand: "fertig" },
    {
      label: latestSubmission ? `Sent to ReelForge · #${latestSubmission.index}` : "Sent to ReelForge",
      zeit: latestSubmission?.sentAt ?? "—",
      zustand: latestSubmission ? "fertig" : belowMinimum ? "offen" : "aktiv",
    },
    {
      label: "In production",
      zeit: latestSubmission?.status === "Cancelled" ? "Cancelled" : inProduktion ? (latestSubmission?.eta ? `ETA ${latestSubmission.eta}` : "Running") : "—",
      zustand: geliefert ? "fertig" : inProduktion ? "aktiv" : "offen",
    },
    {
      label: "Delivered",
      zeit: geliefert ? "Ready in Drive" : latestSubmission?.eta && inProduktion ? `Expected · ${latestSubmission.eta}` : "—",
      zustand: geliefert ? "fertig" : "offen",
    },
  ];

  const letzteAktivitaet = [...collection.history].reverse().slice(0, 2);

  // Die vier Zeilen unter dem Brief kommen aus dem Creator-Profil -- das
  // sind die Felder, die die Richtung eines Creators beschreiben. Leer
  // heisst leer: ein Strich, kein erfundener Text.
  const briefZeilen = [
    { icon: Activity, label: "Tone", wert: creator?.brandDirection },
    { icon: Target, label: "Goal", wert: creator?.creativeDirection },
    { icon: SlidersHorizontal, label: "Constraints", wert: creator?.contentDonts },
    { icon: Sparkles, label: "Key Hooks", wert: creator?.contentDos },
  ];

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#020203" }}>
      <style>{`
        .rf-collection-detail-starfield .star-twinkle { opacity: 0.55 !important; box-shadow: 0 0 4px rgba(255,250,240,0.4) !important; transform: scale(0.85); }
      `}</style>
      {/* Das Aufblenden sitzt INNEN, nicht auf der scrollenden Flaeche.
          Die Bewegung dieser Einblendung bleibt danach als Zustand am
          Element haengen -- und ein Element mit Bewegung wird zum Bezugs-
          punkt fuer alles, was sich "am Bildschirm festhalten" soll. Der
          Reel-Player hat sich dadurch nicht mehr am Bildschirm, sondern an
          der Seite festgehalten: wer weit unten ein Reel anklickte, musste
          erst nach oben scrollen, um ihn zu sehen (Emre, 28.10.2026). */}
      <div className="relative max-w-[1900px] mx-auto px-6 xl:px-8 pt-8 pb-8 animate-fade-in">
        <div className="dashboard-starfield-boost rf-collection-detail-starfield pointer-events-none absolute inset-x-0 top-0 h-[180px] overflow-hidden">
          <StarfieldBackground starCount={90} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(2,2,3,0) 0%, rgba(2,2,3,0.6) 70%, #020203 100%)" }} />
        </div>

        <div className="relative">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12.5px] text-[#afb7c3] hover:text-[#f5f5f5] transition-colors duration-150 mb-3"
          >
            <ArrowLeft size={14} className="text-[#D39448]" />
            {backLabel}
          </button>

          {saveError && (
            <p className="mb-4 text-[12px] text-[#e0664f] rounded-[9px] border border-[rgba(224,102,79,0.3)] bg-[rgba(224,102,79,0.08)] px-3 py-2 max-w-lg">
              {saveError}
            </p>
          )}

          {archived && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[9px] border border-[#1a130b] px-3.5 py-2.5" style={{ background: KARTE_FUELLUNG }}>
              <p className="text-[12px] text-[#cfd3d9]">
                This Collection is archived
                {family.length > 1 ? " — restoring brings back every version." : "."}
              </p>
              {onRestore && (
                <button
                  onClick={onRestore}
                  className="shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[#D39448]/15 text-[#D39448] text-[11.5px] font-medium hover:bg-[#D39448]/25 transition-colors"
                >
                  <ArchiveRestore size={12} />
                  Restore
                </button>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------- Kopf */}
          <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-[18px] items-start">
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <span className={KOPF_KUERZEL}>Collection</span>
                  {!archived && isVersionableCollection(collection.name) ? (
                    <CollectionVersionMenu
                      family={family}
                      currentId={collection.id}
                      nextName={suggestedName}
                      onSwitch={onSwitchCollection}
                      onCreateNext={onStartNext}
                    >
                      <h1 className={`${KOPF_TITEL} cursor-default truncate`}>
                        {collection.name}
                        {family.length > 1 && (
                          <span className="ml-3 text-[11px] font-normal tracking-normal text-[#8c877e] align-middle">
                            {family.length} versions
                          </span>
                        )}
                      </h1>
                    </CollectionVersionMenu>
                  ) : (
                    <h1 className={`${KOPF_TITEL} truncate`}>
                      {collection.name}
                      {family.length > 1 && (
                        <span className="ml-3 text-[11px] font-normal tracking-normal text-[#8c877e] align-middle">
                          {family.length} versions
                        </span>
                      )}
                    </h1>
                  )}

                </div>

                <div className="shrink-0 flex items-center gap-2 pt-[22px]">
                  <GoldKnopf
                    onClick={() => setSendOpen(true)}
                    disabled={belowMinimum}
                    title={
                      belowMinimum
                        ? `Add ${remainingToMinimum} more concept${remainingToMinimum === 1 ? "" : "s"} — collections need at least ${MIN_SEND_COUNT}–15 before they can be sent.`
                        : latestSubmission
                          ? "Send the current concepts to ReelForge again"
                          : "Send this collection to ReelForge for production"
                    }
                    className="!h-9 !text-[12.5px] !px-4 !rounded-lg"
                  >
                    <Send size={13} />
                    {latestSubmission ? "Send to ReelForge again" : "Send to ReelForge"}
                  </GoldKnopf>
                  {isSydOwner && onSendToSyd && (
                    <RahmenKnopf onClick={() => setSydOpen(true)} title="Private — Sydney Studio only" className="!h-9 !text-[12.5px] !rounded-lg">
                      SYD
                    </RahmenKnopf>
                  )}
                  <div className="relative">
                    <RahmenKnopf
                      onClick={onSetPlanning ? () => setKalender((k) => (k === "kopf" ? null : "kopf")) : undefined}
                      disabled={!onSetPlanning}
                      title={collection.deadline ? `Deadline: ${deadlineAnzeige(collection.deadline)}` : "Set a deadline for this collection"}
                      className="!h-9 !text-[12.5px] !rounded-lg"
                    >
                      <CalendarDays size={13} />
                      {collection.deadline ? deadlineKurz(collection.deadline) : "Set Deadline"}
                    </RahmenKnopf>
                    {kalender === "kopf" && onSetPlanning && (
                      <DeadlineKalender
                        wert={collection.deadline}
                        onWahl={(d) => void onSetPlanning({ deadline: d })}
                        onSchliessen={() => setKalender(null)}
                      />
                    )}
                  </div>
                  <RahmenKnopf disabled title="Brief export isn't available yet." className="!h-9 !text-[12.5px] !rounded-lg">
                    <Download size={13} />
                    Export Brief
                  </RahmenKnopf>
                  <div className="relative">
                    <RahmenKnopf onClick={() => setMehrOffen((v) => !v)} title="More" className="!h-9 !w-9 !px-0 !rounded-lg">
                      <Ellipsis size={15} />
                    </RahmenKnopf>
                    {mehrOffen && (
                      <div
                        onMouseLeave={() => setMehrOffen(false)}
                        className="absolute right-0 top-[38px] z-30 w-[220px] rounded-[9px] surface-panel-strong p-1 animate-fade-in"
                      >
                        {!archived && isVersionableCollection(collection.name) && (
                          <button
                            onClick={() => {
                              setMehrOffen(false);
                              onStartNext();
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
                          >
                            New version — “{suggestedName}”
                          </button>
                        )}
                        {kannWiederOeffnen && (
                          <button
                            onClick={() => {
                              setMehrOffen(false);
                              onReopen();
                            }}
                            className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
                          >
                            <RotateCcw size={12} />
                            Make Draft Again
                          </button>
                        )}
                        {archived && onRestore && (
                          <button
                            onClick={() => {
                              setMehrOffen(false);
                              onRestore();
                            }}
                            className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
                          >
                            <ArchiveRestore size={12} />
                            Restore collection
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setMehrOffen(false);
                            setReiter("submitted");
                          }}
                          className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-[11.5px] text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5] transition-colors"
                        >
                          <CloudUpload size={12} />
                          Show submissions
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={`${KOPF_UNTERZEILE} flex items-center gap-2.5 flex-wrap text-[#bdbdc1]`}>
                <span className="flex items-center gap-2">
                  <Initialen creator={creator} groesse={24} />
                  <span>{creator?.name ?? "Unknown creator"}</span>
                </span>
                <span className="w-px h-3.5 bg-white/[0.10]" />
                {/* Read-only — Draft/Sent/Completed reflect real submission
                    state (set automatically), never a manual client pick. */}
                <span
                  className="inline-flex items-center gap-1.5 h-[24px] px-2.5 rounded-[14px] border text-[11.5px] font-medium"
                  style={{
                    color: pille.farbe,
                    borderColor: `${pille.farbe}55`,
                    background: `${pille.farbe}1a`,
                  }}
                >
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: pille.farbe, boxShadow: `0 0 6px ${pille.farbe}` }} />
                  {pille.text}
                </span>
                <span className="text-[#6f7075]">•</span>
                <span className="text-[#afb7c3]">Updated {formatRelativeTime(collection.updatedAt)}</span>
                <span className="w-px h-3.5 bg-white/[0.10]" />
                <span className="flex items-center gap-1.5 text-[#afb7c3]">
                  <Layers size={13} className="text-[#D39448]" />
                  {total} concept{total === 1 ? "" : "s"}
                </span>
                {kannWiederOeffnen && (
                  <button
                    onClick={onReopen}
                    title="Reopens this version for a new round of work — its finished production history stays intact."
                    className="flex items-center gap-1 text-[11px] text-[#8c877e] hover:text-[#D39448] transition-colors"
                  >
                    <RotateCcw size={10} />
                    Make Draft Again
                  </button>
                )}
              </div>

              {/* ---------------------------------------- Production Progress */}
              <Auftritt verzoegerung={40} className={KOPF_ABSTAND}>
                <div className={`${V3_KARTE} px-[18px] py-[13px] flex items-center gap-6`} style={V3_KARTE_STIL}>
                  <div className="shrink-0 w-[150px]">
                    <p className="text-[13.5px] font-semibold text-[#fefefe] leading-[18px]">Production Progress</p>
                    <p className="mt-[2px] text-[11px] text-[#dfe1e0] leading-[14px]">
                      {total} concept{total === 1 ? "" : "s"} total
                    </p>
                  </div>
                  {/* Balken farbgenau nach Emres Vorlage (13.11.2026, Farben aus dem
                      Bild gemessen): helles Gold #f2c674 (Unused), kraeftiges Gold
                      #eaaf51 (In Production), Grau #868585 als Rest = Submitted --
                      in der Vorlage ist das Grau die Spur selbst. Die Anteile
                      beziehen sich auf alle nicht abgelehnten Konzepte, damit
                      das Grau genau den eingereichten entspricht. */}
                  <div
                    className="flex-1 min-w-0 h-[16px] rounded-full bg-[#868585] overflow-hidden flex"
                    title={`${unused} unused · ${sent} in production · ${used} submitted${rejected ? ` · ${rejected} rejected` : ""}`}
                  >
                    <div
                      className="h-full bg-[linear-gradient(90deg,#f1c576_0%,#f3c978_15%,#f2c673_60%,#f1c36d_100%)] transition-[width] duration-700"
                      style={{ width: `${balkenAnteil(unused)}%` }}
                    />
                    <div
                      className="h-full bg-[linear-gradient(90deg,#ebb052_0%,#eaaf51_50%,#e9ae52_100%)] transition-[width] duration-700"
                      style={{ width: `${balkenAnteil(sent)}%` }}
                    />
                  </div>
                  <div className="shrink-0 flex items-center gap-6 text-[12.5px] text-[#fefefe] tabular-nums">
                    <span className="flex items-center gap-2">
                      <span className="w-[11px] h-[11px] rounded-full bg-[#f1ca73]" />
                      {unused} Unused ({balkenAnteil(unused)}%)
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-[11px] h-[11px] rounded-full bg-[#eeb44f]" />
                      {sent} In Production ({balkenAnteil(sent)}%)
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-[11px] h-[11px] rounded-full bg-[#a7a7a6]" />
                      {used} Submitted ({balkenAnteil(used)}%)
                    </span>
                    {rejected > 0 && (
                      <span className="flex items-center gap-2 text-[#8c877e]">
                        <span className="w-[11px] h-[11px] rounded-full bg-[#3a3a40]" />
                        {rejected} Rejected
                      </span>
                    )}
                  </div>
                </div>
              </Auftritt>

              {/* ---------------------------------------------- Kennzahlen */}
              <Auftritt verzoegerung={110} className="mt-3.5">
                <div className="grid grid-cols-5 gap-3.5">
                  {(
                    [
                      [Layers, total, "Total Concepts"],
                      [CircleCheck, unused, "Unused"],
                      // Beschriftungen nach Emres Wunsch (13.11.2026): "Sent to
                      // ReelForge" heisst In Production, "Used" heisst Submissions
                      // (13.11.2026 umbenannt). Die Zahlen dahinter sind dieselben wie zuvor.
                      [Video, sent, "In Production"],
                      [CloudUpload, used, "Submissions"],
                      [XCircle, rejected, "Rejected"],
                    ] as [typeof Layers, number, string][]
                  ).map(([Icon, wert, label]) => (
                    <div key={label} className={`${V3_KARTE} min-h-[70px] px-3.5 py-3 flex items-center gap-3`} style={V3_KARTE_STIL}>
                      <ZeichenFeld icon={Icon} size={34} radius={9} />
                      {/* Zahl und Beschriftung mittig, in jeder Karte gleich: die
                          Beschriftung bleibt auf EINER Zeile (etwas enger gesetzt),
                          damit "Submitted by Creator" die Zahl nicht nach oben schiebt
                          (Emre, 13.11.2026). Wird es doch einmal zu schmal, wird
                          gekuerzt und der volle Text steht beim Darueberfahren. */}
                      <div className="min-w-0 flex-1">
                        <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#f5f5f5] tabular-nums">
                          <Zahl wert={wert} />
                        </p>
                        <p className="mt-1.5 text-[11.5px] leading-[14px] tracking-[-0.15px] text-[#afb7c3] whitespace-nowrap truncate" title={label}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Auftritt>

              {/* ------------------------------------------------- Reiter */}
              {/* EIN Panel fuer den ganzen Arbeitsbereich: oben die Reiter als
                  Kopfstreifen, darunter Suche und Karten -- nicht mehrere kleine
                  Inseln nebeneinander (Emre, 12.11.2026). */}
              <Auftritt verzoegerung={180} className="mt-3.5">
                <div className={`${V3_KARTE} overflow-hidden`} style={V3_KARTE_STIL}>
                {/* Vier gleich breite Reiter in der Reihenfolge des Originals
                    (Emre, 13.11.2026): Concepts, Timeline, Notes, Submitted.
                    "Submitted" sind die Uebergaben an ReelForge, "Timeline" der
                    Verlauf -- vorher lagen beide zusammen unter Timeline. */}
                <div className="p-2.5 grid grid-cols-4 gap-2 border-b border-white/[0.06]">
                  {(
                    [
                      ["concepts", LayoutGrid, "Concepts"],
                      ["timeline", CalendarDays, "Timeline"],
                      ["notes", FileText, "Notes"],
                      ["submitted", CloudUpload, "Submitted"],
                    ] as [Reiter, typeof LayoutGrid, string][]
                  ).map(([key, Icon, label]) => {
                    const aktiv = reiter === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setReiter(key)}
                        className={[
                          "h-[38px] rounded-[9px] flex items-center justify-center gap-2 text-[13.5px] border transition-colors duration-150 press-feedback",
                          aktiv
                            ? "border-[rgba(211,148,72,0.6)] bg-[rgba(211,148,72,0.12)] text-[#D39448] font-medium shadow-[0_0_14px_rgba(211,148,72,0.18)]"
                            : "border-[#1a130b] text-[#cfd3d9] hover:text-[#f5f5f5] hover:border-[#2f2113]",
                        ].join(" ")}
                        style={aktiv ? undefined : { background: KARTE_FUELLUNG }}
                      >
                        <Icon size={15} strokeWidth={1.9} />
                        {label}
                      </button>
                    );
                  })}
                </div>

              {/* ------------------------------------------- Reiter-Inhalt */}
              {reiter === "concepts" && (
                <>
                  <Auftritt verzoegerung={240} className="px-4 pt-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 min-w-0">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8c877e]" />
                        <input
                          ref={sucheRef}
                          value={suche}
                          onChange={(e) => setSuche(e.target.value)}
                          placeholder='Search concepts, e.g. "gym routine", "outfit haul"...'
                          className="w-full h-[44px] pl-10 pr-3.5 rounded-[10px] border border-[#1a130b] text-[13.5px] text-[#f5f5f5] placeholder:text-[#6f7075] outline-none focus-glow hover:border-[#2f2113] transition-colors duration-150"
                          style={{ background: KARTE_FUELLUNG }}
                        />
                      </div>
                      <Auswahl<StatusFilter>
                        wert={statusFilter}
                        onChange={setStatusFilter}
                        breite={132}
                        optionen={[
                          { wert: "all", label: "All Statuses" },
                          { wert: "Unused", label: "Unused" },
                          { wert: "Sent", label: "Sent" },
                          { wert: "Used", label: "Used" },
                          { wert: "Rejected", label: "Rejected" },
                        ]}
                      />
                      <Auswahl<PlattformFilter>
                        wert={plattformFilter}
                        onChange={setPlattformFilter}
                        breite={144}
                        optionen={[
                          { wert: "all", label: "All Platforms" },
                          { wert: "instagram", label: "Instagram" },
                          { wert: "tiktok", label: "TikTok" },
                        ]}
                      />
                      <Auswahl<Sortierung>
                        wert={sortierung}
                        onChange={setSortierung}
                        breite={150}
                        optionen={[
                          { wert: "recent", label: "Most Recent" },
                          { wert: "oldest", label: "Oldest" },
                          { wert: "views", label: "Most viewed" },
                        ]}
                      />
                      <div className="shrink-0 h-[44px] p-1 rounded-[10px] border border-[#1a130b] flex items-center gap-1" style={{ background: KARTE_FUELLUNG }}>
                        {(
                          [
                            ["raster", LayoutGrid, "Grid"],
                            ["liste", List, "List"],
                          ] as [Ansicht, typeof LayoutGrid, string][]
                        ).map(([key, Icon, label]) => (
                          <button
                            key={key}
                            onClick={() => setAnsicht(key)}
                            title={label}
                            className={[
                              "w-[36px] h-[34px] rounded-[7px] flex items-center justify-center transition-colors duration-150",
                              ansicht === key
                                ? "bg-[rgba(211,148,72,0.16)] text-[#D39448] border border-[rgba(211,148,72,0.5)]"
                                : "text-[#afb7c3] hover:text-[#f5f5f5] hover:bg-white/[0.05] border border-transparent",
                            ].join(" ")}
                          >
                            <Icon size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </Auftritt>

                  <Auftritt verzoegerung={300} className="p-4">
                    <ConceptGrid
                      concepts={sichtbareKonzepte}
                      submittedConceptIds={submittedConceptIds}
                      creators={creators}
                      collections={allCollections}
                      currentCreatorId={collection.creatorId}
                      ansicht={ansicht}
                      leerText={total > 0 ? "No concepts match these filters." : undefined}
                      onStatusChange={onSetConceptStatus}
                      onRemove={onRemoveVideo}
                      onNotesChange={onSetConceptNotes}
                      onOpen={openConceptDetail}
                      onReassign={onReassignConcept}
                      onAssignToAnother={onAssignConceptToAnother}
                    />
                  </Auftritt>
                </>
              )}

              {reiter === "submitted" && (
                <Auftritt verzoegerung={240} className="p-4">
                  <div className={`${V3_KACHEL} p-[18px]`} style={V3_KACHEL_STIL}>
                    <PanelKopf icon={PackageCheck} titel="Submissions" />
                    {collection.submissions.length === 0 ? (
                      <p className="mt-3 text-[12px] text-[#8c877e]">Nothing sent to ReelForge yet.</p>
                    ) : (
                      <div className="mt-3.5 divide-y divide-white/[0.06]">
                        {[...collection.submissions].reverse().map((s) => (
                          <div key={s.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[12.5px] text-[#f5f5f5] leading-snug">Submission #{s.index}</p>
                                <p className="mt-0.5 text-[11px] text-[#8c877e]">
                                  {s.conceptIds.length} concepts · {s.sentAt}
                                  {s.eta && s.status !== "Finished" && s.status !== "Cancelled" && <> · ETA {s.eta}</>}
                                </p>
                                {s.note && <p className="mt-1 text-[11.5px] text-[#cfd3d9] leading-relaxed">{s.note}</p>}
                              </div>
                              {/* production status: read-only for the client */}
                              <button
                                onClick={() => s.status === "Check Inbox" && setInboxNoteId(inboxNoteId === s.id ? null : s.id)}
                                title={s.status === "Check Inbox" ? "ReelForge needs something from you" : "Production status — set by ReelForge"}
                                className={[
                                  "shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[11px] font-medium",
                                  SUBMISSION_STATUS_STYLES[s.status],
                                  s.status === "Check Inbox" ? "animate-pulse cursor-pointer" : "cursor-default",
                                ].join(" ")}
                              >
                                {s.status === "Check Inbox" && <Inbox size={10} />}
                                {s.status === "Cancelled" && <Ban size={10} />}
                                {s.status}
                              </button>
                            </div>
                            {inboxNoteId === s.id && (
                              <p className="mt-2 rounded-[7px] border border-[#1a130b] px-2.5 py-2 text-[11.5px] text-[#cfd3d9] leading-relaxed animate-fade-in" style={{ background: KARTE_FUELLUNG }}>
                                ReelForge needs additional information for this submission.
                              </p>
                            )}
                            {s.status === "Finished" && s.deliveryUrl && (
                              <a
                                href={s.deliveryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-[#afb7c3] hover:text-[#D39448] transition-colors duration-150"
                              >
                                <DriveGlyph size={12} />
                                Open in Drive
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </Auftritt>
              )}

              {reiter === "timeline" && (
                <Auftritt verzoegerung={240} className="p-4">
                  <div className={`${V3_KACHEL} p-[18px]`} style={V3_KACHEL_STIL}>
                    <PanelKopf icon={Clock} titel="History" />
                    {collection.history.length === 0 ? (
                      <p className="mt-3 text-[12px] text-[#8c877e]">No activity yet.</p>
                    ) : (
                      // Das Neueste oben: ein Verlauf waechst nach oben.
                      <div className="mt-3.5 divide-y divide-white/[0.06]">
                        {[...collection.history].reverse().map((entry, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className="w-[6px] h-[6px] rounded-full bg-[#D39448]/70 shrink-0" />
                              <span className="text-[12.5px] text-[#e4e4e7] truncate">{entry.label}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-[#8c877e] tabular-nums">{entry.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Auftritt>
              )}

              {reiter === "notes" && (
                <Auftritt verzoegerung={240} className="p-4">
                  <div className={`${V3_KACHEL} p-[18px]`} style={V3_KACHEL_STIL}>
                    <PanelKopf icon={MessageSquare} titel="Direction & notes" />
                    <p className="mt-1.5 text-[11px] text-[#8c877e]">
                      What the production team should know about this collection. Saves as you type.
                    </p>
                    <textarea
                      value={notes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      rows={10}
                      className="mt-3.5 w-full resize-none rounded-[9px] border border-[#1a130b] p-3.5 text-[13px] leading-[20px] text-[#e4e4e7] placeholder:text-[#6f7075] outline-none focus-glow"
                      style={{ background: KARTE_FUELLUNG }}
                      placeholder="Add direction, references, or constraints for the production team..."
                    />
                  </div>
                </Auftritt>
              )}
                </div>
              </Auftritt>
            </div>

            {/* ================================================= Rechte Spalte */}
            <div className="space-y-3.5">
              <Auftritt verzoegerung={80}>
                <div className={`${V3_KARTE} p-4`} style={V3_KARTE_STIL}>
                  <PanelKopf icon={FileText} titel="Collection Brief" />
                  {notes.trim() ? (
                    <p className="mt-2.5 text-[12px] leading-[17px] text-[#cfd3d9] whitespace-pre-line line-clamp-6">{notes}</p>
                  ) : (
                    <button
                      onClick={() => setReiter("notes")}
                      className="mt-2.5 text-left text-[12px] leading-[17px] text-[#8c877e] hover:text-[#D39448] transition-colors"
                    >
                      No direction yet — add it under Notes.
                    </button>
                  )}
                  <div className="my-3 border-t border-white/[0.06]" />
                  <div className="grid grid-cols-[14px_78px_minmax(0,1fr)] gap-x-2 gap-y-2 items-start">
                    {briefZeilen.map(({ icon: Icon, label, wert }) => (
                      <div key={label} className="contents">
                        <Icon size={13} className="text-[#D39448] mt-[1px]" strokeWidth={1.9} />
                        <span className="text-[11.5px] font-medium text-[#afb7c3] leading-[16px]">{label}:</span>
                        <span className="text-[11.5px] text-[#dcdcde] leading-[16px] line-clamp-3" title={wert || undefined}>
                          {wert?.trim() ? wert : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Auftritt>

              <Auftritt verzoegerung={150}>
                <div className={`${V3_KARTE} p-4`} style={V3_KARTE_STIL}>
                  <PanelKopf icon={Users} titel="Assignment" />
                  <div className="mt-3 flex items-center">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Initialen creator={creator} groesse={34} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-[#f5f5f5] leading-[16px] truncate">{creator?.name ?? "Unknown creator"}</p>
                        <p className="text-[11px] text-[#8c877e] truncate">{creator?.handle ? `@${creator.handle.replace(/^@/, "")}` : "—"}</p>
                      </div>
                    </div>
                    <div className="w-px h-10 bg-white/[0.06] mx-3" />
                    {/* Deadline und Prioritaet wie in Emres Vorlage (13.11.2026):
                        Klick auf das Datum oeffnet den Kalender, Klick auf die
                        Pille die Auswahl Low / Medium / High. */}
                    <div className="min-w-0 flex-[1.6] space-y-2.5">
                      <div className="relative flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-[#afb7c3]">
                          <CalendarDays size={13} className="text-[#D39448]" strokeWidth={1.8} />
                          Deadline
                        </span>
                        <button
                          onClick={onSetPlanning ? () => setKalender((k) => (k === "kasten" ? null : "kasten")) : undefined}
                          disabled={!onSetPlanning}
                          title={collection.deadline ? `${deadlineAnzeige(collection.deadline)} — click to change` : "Pick a deadline"}
                          className="h-[24px] px-2.5 rounded-full border border-white/[0.10] text-[11px] font-medium text-[#f5f5f5] tabular-nums whitespace-nowrap hover:border-[rgba(211,148,72,0.55)] hover:text-[#EAC088] transition-colors"
                        >
                          {collection.deadline ? deadlineKurz(collection.deadline) : <span className="text-[#8c877e]">Set date</span>}
                        </button>
                        {kalender === "kasten" && onSetPlanning && (
                          <DeadlineKalender
                            wert={collection.deadline}
                            onWahl={(d) => void onSetPlanning({ deadline: d })}
                            onSchliessen={() => setKalender(null)}
                          />
                        )}
                      </div>
                      <div className="relative flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-[#afb7c3]">
                          <Flag size={13} className="text-[#D39448]" strokeWidth={1.8} />
                          Priority
                        </span>
                        <button
                          onClick={onSetPlanning ? () => setPrioMenue((v) => !v) : undefined}
                          disabled={!onSetPlanning}
                          title="Set priority"
                          className={[
                            "h-[24px] px-3 rounded-full border text-[11px] font-medium transition-colors",
                            collection.priority === "High"
                              ? "border-[rgba(211,148,72,0.7)] bg-[rgba(211,148,72,0.14)] text-[#EAC088] shadow-[0_0_10px_rgba(211,148,72,0.2)]"
                              : collection.priority === "Medium"
                                ? "border-[rgba(242,181,82,0.4)] bg-[rgba(242,181,82,0.08)] text-[#f2b552]"
                                : collection.priority === "Low"
                                  ? "border-white/[0.14] bg-white/[0.04] text-[#cfd3d9]"
                                  : "border-white/[0.10] text-[#8c877e] hover:text-[#cfd3d9]",
                          ].join(" ")}
                        >
                          {collection.priority ?? "Set"}
                        </button>
                        {prioMenue && onSetPlanning && (
                          <div
                            onMouseLeave={() => setPrioMenue(false)}
                            className="absolute right-0 top-[calc(100%+6px)] z-40 w-[132px] rounded-[9px] surface-panel-strong p-1 animate-fade-in"
                          >
                            {(["High", "Medium", "Low"] as CollectionPriority[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => {
                                  void onSetPlanning({ priority: p });
                                  setPrioMenue(false);
                                }}
                                className={[
                                  "w-full text-left px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors",
                                  collection.priority === p ? "text-[#f5f5f5] bg-white/[0.06]" : "text-[#cfd3d9] hover:bg-white/[0.06] hover:text-[#f5f5f5]",
                                ].join(" ")}
                              >
                                {p}
                              </button>
                            ))}
                            {collection.priority && (
                              <button
                                onClick={() => {
                                  void onSetPlanning({ priority: null });
                                  setPrioMenue(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-md text-[11.5px] text-[#8c877e] hover:bg-white/[0.06]"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <GoldKnopf
                    onClick={creator && onOpenCreator ? () => onOpenCreator(creator.id) : undefined}
                    disabled={!creator || !onOpenCreator}
                    title={creator ? "Open this creator's profile" : "No creator"}
                    className="mt-3.5 w-full !h-[34px] !text-[12px]"
                  >
                    <ExternalLink size={12} />
                    Open Creator Profile
                  </GoldKnopf>
                </div>
              </Auftritt>

              <Auftritt verzoegerung={220}>
                <div className={`${V3_KARTE} p-4`} style={V3_KARTE_STIL}>
                  <PanelKopf icon={Clock} titel="Timeline" rechts={{ label: "View all", onClick: () => setReiter("timeline") }} />
                  <div className="relative mt-3">
                    <div className="absolute left-[8px] top-[16px] bottom-[16px] w-px bg-white/[0.08]" />
                    {zeitleiste.map((z) => (
                      <div key={z.label} className="relative flex items-center gap-2.5 py-[6px]">
                        <span
                          className="relative z-[1] w-[17px] h-[17px] rounded-full flex items-center justify-center shrink-0"
                          style={
                            z.zustand === "fertig"
                              ? { background: "#63c07f", boxShadow: "0 0 8px rgba(99,192,127,0.35)" }
                              : z.zustand === "aktiv"
                                ? { border: "2px solid #5eb1ff", background: "#020203", boxShadow: "0 0 8px rgba(94,177,255,0.35)" }
                                : { border: "2px solid #3a3a40", background: "#020203" }
                          }
                        >
                          {z.zustand === "fertig" && (
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5.2 4.1 7.3 8 3.2" stroke="#031006" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={["block text-[12px] leading-[16px] truncate", z.zustand === "offen" ? "text-[#8c877e]" : "text-[#e4e4e7]"].join(" ")}>
                            {z.label}
                          </span>
                          <span className="block text-[10.5px] leading-[14px] text-[#8c877e] tabular-nums truncate">{z.zeit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Auftritt>

              <Auftritt verzoegerung={290}>
                <div className={`${V3_KARTE} p-4`} style={V3_KARTE_STIL}>
                  <PanelKopf icon={Activity} titel="Recent Activity" rechts={{ label: "View all", onClick: () => setReiter("timeline") }} />
                  {letzteAktivitaet.length === 0 ? (
                    <p className="mt-3 text-[12px] text-[#8c877e]">Nothing has happened yet.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-white/[0.06]">
                      {letzteAktivitaet.map((e, i) => {
                        const Icon = /note|renamed|direction|updated/i.test(e.label) ? Pencil : Upload;
                        return (
                          <div key={i} className="flex items-center gap-2.5 py-2.5 first:pt-2 last:pb-0">
                            <span className="w-[26px] h-[26px] rounded-[7px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0">
                              <Icon size={12} className="text-[#afb7c3]" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[12px] text-[#e4e4e7] leading-[16px] truncate">{e.label}</p>
                              <p className="text-[10.5px] text-[#8c877e] leading-[14px]">{e.date}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Auftritt>
            </div>
          </div>
        </div>
      </div>

      <SendToReelForgePanel
        open={sendOpen}
        creatorName={creator?.name ?? ""}
        collectionName={collection.name}
        totalCount={sendableConcepts.length}
        overlapCount={overlapCount}
        overlapSubmissionIndexes={overlapSubmissionIndexes}
        onClose={() => setSendOpen(false)}
        onConfirm={(note) => onSendSubmission(note)}
      />

      {onSendToSyd && (
        <SendToSydPanel
          open={sydOpen}
          collectionName={collection.name}
          onClose={() => setSydOpen(false)}
          onConfirm={(note) => onSendToSyd(note)}
        />
      )}

      {/* Shown while re-resolving a Concept's playable video (or if that
          fails) — the real detail modal below only ever renders once a
          video has actually loaded. */}
      {detailConceptId && !detailVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[3px] animate-fade-in">
          <div className="rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl px-6 py-5 text-center max-w-xs">
            {detailLoading ? (
              <>
                <Loader2 size={18} className="mx-auto animate-spin text-neutral-400" />
                <p className="mt-2.5 text-[12.5px] text-neutral-400">Loading video…</p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-neutral-300">{detailError ?? "Couldn't load this video."}</p>
                <button
                  onClick={closeConceptDetail}
                  className="mt-3 text-[12px] text-[#D39448] hover:brightness-110 transition-[filter]"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ReelDetailModal
        video={detailVideo}
        open={!!detailVideo}
        creator={creator}
        onClose={closeConceptDetail}
        // Dieselbe Notiz wie im Research: sie haengt am Reel, nicht am
        // Konzept (siehe reelSchluessel).
        notizen
        workspaceId={workspaceId}
        onPrev={() => {
          if (detailIndex > 0) void openConceptDetail(sichtbareKonzepte[detailIndex - 1]);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < sichtbareKonzepte.length - 1) {
            void openConceptDetail(sichtbareKonzepte[detailIndex + 1]);
          }
        }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < sichtbareKonzepte.length - 1}
      />
    </div>
  );
}
