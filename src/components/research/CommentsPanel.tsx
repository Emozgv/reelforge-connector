import { useEffect, useRef, useState } from "react";
import { MessageCircle, Loader2, Heart, ChevronDown, Check } from "lucide-react";
import type { ReelVideo } from "../../types";
import type { LiveComment, KommentarSortierung } from "../../state/useLiveResearchSession";

// Instagrams eigenes Platzhalter-Bild: heller Kreis mit grauer Figur. Es
// steht dort, wo jemand kein Profilbild hat -- und ebenso, wenn Instagrams
// befristete Bildadresse nicht mehr laedt. Nachgezeichnet, nicht von
// Instagram geladen: ein Platzhalter, der selbst erst geladen werden muss,
// waere kein Platzhalter.
function StandardBild({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="16" fill="#e8e8e8" />
      <circle cx="16" cy="12.4" r="5.1" fill="#a3a3a3" />
      <path d="M16 19.2c-5.1 0-9.2 3.1-9.2 7v1.1a16 16 0 0 0 18.4 0v-1.1c0-3.9-4.1-7-9.2-7Z" fill="#a3a3a3" />
    </svg>
  );
}

// Instagrams blaues Verifiziert-Abzeichen: gezackte Scheibe, weisser Haken.
function Haekchen({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-label="Verified" className={className}>
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="#3797F0"
      />
      <path d="m8.8 12.1 2.1 2.1 4.3-4.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Wie alt der Kommentar ist, in Instagrams eigener Kurzform -- auf der
// deutschen Seite steht dort "14 Wo.", auf der englischen "14w". Wir sind
// durchgehend englisch, also die englische Form.
// Instagram zaehlt keine Monate: nach Wochen kommt direkt das Jahr.
function vorZeit(postedAt: number | null | undefined): string | null {
  if (typeof postedAt !== "number" || !Number.isFinite(postedAt) || postedAt <= 0) return null;
  const sekunden = Math.floor(Date.now() / 1000) - postedAt;
  if (sekunden < 0) return null;
  if (sekunden < 60) return "now";
  const minuten = Math.floor(sekunden / 60);
  if (minuten < 60) return `${minuten}m`;
  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `${stunden}h`;
  const tage = Math.floor(stunden / 24);
  if (tage < 7) return `${tage}d`;
  const wochen = Math.floor(tage / 7);
  if (wochen < 52) return `${wochen}w`;
  return `${Math.floor(tage / 365)}y`;
}

// Dieselben drei Moeglichkeiten, die Instagram Web oben im Kommentarfenster
// anbietet -- dort auf Deutsch ("Fuer dich", "Neueste", "Meta Verified"),
// hier auf Englisch wie der Rest der Oberflaeche.
const SORTIERUNGEN: { wert: KommentarSortierung; name: string }[] = [
  { wert: "fuer-dich", name: "For you" },
  { wert: "neueste", name: "Newest" },
  { wert: "meta-verified", name: "Meta Verified" },
];

// Read-only, on-demand only -- never prefetched, never polled. Two distinct
// load moments, both deliberate:
//  1. The panel is opened for the reel currently in view -> load right away.
//  2. The panel stays open and the VA moves to a different reel (Next/Prev)
//     -> wait DWELL_MS of them actually staying on that reel before loading
//     its comments, so a quick skim through several reels with the panel
//     open never fires a burst of comment fetches for reels nobody actually
//     paused on. Skipping away before the dwell elapses cancels the pending
//     load entirely -- nothing was ever requested for that reel.
// Closing the panel (isOpen false) tears down any pending timer and fetches
// nothing until it's reopened -- there is no comment-fetch activity at all
// while it's closed.

// Disabled ("View all N comments" was a dead promise -- no pagination/API
// support for loading more than the initial batch exists) -- flip back to
// true once that support is real.
const SHOW_VIEW_ALL_COMMENTS = false;

type ReelResult =
  | { status: "loaded"; comments: LiveComment[] }
  | { status: "empty" }
  | { status: "unavailable"; error?: string };

// Zeigt das Profilbild, und sobald es nicht laedt, Instagrams Platzhalter.
// Bewusst mit eigenem Zustand statt nur CSS: ein unsichtbar geschaltetes
// kaputtes Bild liesse ein Loch, der Platzhalter fuellt es.
function KommentarBild({ src }: { src: string | null }) {
  const [kaputt, setKaputt] = useState(false);
  if (!src || kaputt) return <StandardBild className="w-7 h-7 rounded-full shrink-0" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="w-7 h-7 rounded-full object-cover shrink-0 bg-white/[0.06]"
      onError={() => setKaputt(true)}
    />
  );
}

export function CommentsPanel({
  video,
  isOpen,
  fetchComments,
}: {
  video: ReelVideo | null;
  isOpen: boolean;
  fetchComments: (reelId: string, sourceUrl: string, abMarke?: string | null, sortierung?: KommentarSortierung | null) => Promise<{ available: boolean; comments: LiveComment[]; reelId: string; error?: string; naechste?: string | null }>;
}) {
  const [displayReelId, setDisplayReelId] = useState<string | null>(null);
  const [dwelling, setDwelling] = useState(false);
  const [loading, setLoading] = useState(false);
  // Fortsetzungsmarke je Reel: ab hier liefert Instagram die naechsten
  // Kommentare. Fehlt sie, gibt es keine weiteren.
  const markenRef = useRef<Map<string, string | null>>(new Map());
  const [laedtMehr, setLaedtMehr] = useState(false);
  const listeRef = useRef<HTMLDivElement>(null);
  // Die nachgeladenen Kommentare liegen in einem ref, nicht im Zustand.
  // Dieser Zaehler loest das Neuzeichnen aus -- setDisplayReelId mit
  // demselben Wert tut es nicht, React steigt dann aus.
  const [, neuZeichnen] = useState(0);
  // Welcher Reiter gewaehlt ist. "notizen" ist bewusst kein Platzhalter nur
  // in der Anzeige: solange er gewaehlt ist, wird NICHTS geholt. Nur so
  // laesst sich pruefen, ob das Laden der Kommentare -- und damit das
  // Oeffnen einer zweiten Instagram-Seite im selben Browser -- die Ursache
  // fuer die zunehmende Traegheit der Sitzung ist.
  const [reiter, setReiter] = useState<"kommentare" | "notizen">("kommentare");
  const kommentareAktiv = isOpen && reiter === "kommentare";
  // Instagrams Kommentar-Sortierung. "For you" ist Instagrams Normalfall.
  const [sortierung, setSortierung] = useState<KommentarSortierung>("fuer-dich");
  const [sortOffen, setSortOffen] = useState(false);
  // Zwischenspeicher und Fortsetzungsmarke haengen an Reel UND Sortierung:
  // eine andere Reihenfolge ist eine andere Liste, sonst zeigte der Wechsel
  // weiter die alte an.
  const schluessel = (reelId: string) => `${reelId}|${sortierung}`;

  const wasOpenRef = useRef(false);
  const dwellTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  // Every reel this panel-open session has actually finished fetching for,
  // so bouncing back to a reel already loaded (e.g. a dwell for a different
  // reel gets cancelled by returning here) shows its real result again
  // instead of a stale "loading" left over from that cancelled dwell.
  const resultsRef = useRef<Map<string, ReelResult>>(new Map());

  useEffect(() => {
    function clearDwellTimer() {
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    }

    async function runFetch(targetVideo: ReelVideo) {
      const myRequestId = ++requestIdRef.current;
      setLoading(true);
      setDwelling(false);
      setDisplayReelId(targetVideo.id);
      const result = await fetchComments(targetVideo.id, targetVideo.sourceUrl, null, sortierung);
      markenRef.current.set(schluessel(targetVideo.id), result.naechste ?? null);
      // A newer open/close/reel-change already superseded this request --
      // never let a late response overwrite what's currently shown.
      if (myRequestId !== requestIdRef.current) return;
      const stored: ReelResult = !result.available
        ? { status: "unavailable", error: result.error }
        : result.comments.length === 0
          ? { status: "empty" }
          : { status: "loaded", comments: result.comments };
      resultsRef.current.set(schluessel(targetVideo.id), stored);
      setLoading(false);
    }

    clearDwellTimer();

    if (!kommentareAktiv || !video) {
      wasOpenRef.current = kommentareAktiv;
      // Invalidate any fetch already in flight so its response, if it
      // lands after this, is discarded rather than shown once reopened.
      requestIdRef.current++;
      setLoading(false);
      setDwelling(false);
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      // Der Zwischenspeicher wird hier bewusst NICHT mehr geleert. Vorher
      // stand an dieser Stelle `resultsRef.current = new Map()` -- ein
      // Wechsel auf Notes und zurueck warf damit alles weg und holte die
      // Kommentare desselben Reels noch einmal, mit Ladezeit und einem
      // weiteren Seitenaufruf in der Instagram-Sitzung. Kommentare
      // gehoeren zum Reel, nicht zum Oeffnen des Panels.
      // (09.10.2026 von Emre gemeldet.)
      if (resultsRef.current.has(schluessel(video.id))) {
        requestIdRef.current++;
        setLoading(false);
        setDwelling(false);
        setDisplayReelId(video.id);
        return;
      }
      void runFetch(video);
      return;
    }

    if (resultsRef.current.has(schluessel(video.id))) {
      // Already have a real result for this reel (it was fully loaded
      // before, or the VA is back after an in-flight fetch already
      // finished) -- show it again, no new request.
      requestIdRef.current++;
      setLoading(false);
      setDwelling(false);
      setDisplayReelId(video.id);
      return;
    }

    // Panel was already open and the reel changed under it (Next/Prev) --
    // only load after a genuine dwell, never on every swipe. Deliberately
    // leaves displayReelId/loading alone here -- whatever was on screen for
    // the previous reel just stays there until this dwell actually
    // completes, rather than flashing to empty the instant the VA moves on.
    // Sofort holen, ohne Wartezeit. Die Verweildauer gab es nur, weil fuer
    // jedes Reel eine zweite Instagram-Seite geoeffnet wurde -- beim
    // Durchblaettern waeren das Dutzende gewesen. Seit dem 09.10.2026
    // kommen die Kommentare ueber Instagrams eigene Adresse, genau wie die
    // Aufrufzahl, und das kostet nur noch eine schlanke Anfrage.
    //
    // Ein Wechsel waehrend eines laufenden Abrufs macht dessen Ergebnis
    // ungueltig (requestIdRef), es kann also nichts Falsches stehenbleiben.
    void runFetch(video);
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kommentareAktiv, video?.id, sortierung]);

  if (!isOpen) return null;

  // Instagram liefert sehr kleine Portionen -- teils sechs Kommentare.
  // Die fuellen die Spalte nicht, also gibt es nichts zu scrollen, und das
  // Nachladen beim Scrollen loest nie aus (09.10.2026 von Emre gemeldet).
  // Deshalb nach jedem Zeichnen pruefen: passt alles hinein, obwohl es mehr
  // gibt? Dann von selbst die naechste Portion holen, bis die Spalte voll
  // ist oder Instagram nichts mehr hat.
  useEffect(() => {
    const el = listeRef.current;
    if (!el || !video || !displayReelId || laedtMehr) return;
    const marke = markenRef.current.get(schluessel(displayReelId));
    if (!marke) return;
    if (el.scrollHeight > el.clientHeight + 40) return;
    let weg = false;
    void (async () => {
      setLaedtMehr(true);
      const a = await fetchComments(video.id, video.sourceUrl, marke, sortierung).catch(() => null);
      if (weg) return;
      setLaedtMehr(false);
      if (!a || video.id !== displayReelId) return;
      markenRef.current.set(schluessel(displayReelId), a.naechste ?? null);
      const bisher = resultsRef.current.get(schluessel(displayReelId));
      const alte = bisher?.status === "loaded" ? bisher.comments : [];
      const bekannt = new Set(alte.map((k) => k.id));
      const neue = (a.comments ?? []).filter((k) => !bekannt.has(k.id));
      if (neue.length) {
        resultsRef.current.set(schluessel(displayReelId), { status: "loaded", comments: [...alte, ...neue] });
        neuZeichnen((n) => n + 1);
      } else {
        // Nichts Neues gekommen -- sonst liefe das endlos weiter.
        markenRef.current.set(schluessel(displayReelId), null);
      }
    })();
    return () => { weg = true; };
  });

  const result = displayReelId ? resultsRef.current.get(schluessel(displayReelId)) : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Comments/Notes tabs — one bordered segmented box (matching the
          reference exactly), not two loose buttons with a divider under
          them. Notes has no backing feature yet (no note storage exists
          anywhere in the app), so it's shown per the reference but
          disabled rather than invented. */}
      <div className="mx-4 mt-4 flex items-stretch rounded-xl border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          onClick={() => setReiter("kommentare")}
          className={
            "flex-1 flex items-center justify-center gap-1.5 h-11 text-[12.5px] font-medium " +
            (reiter === "kommentare"
              ? "text-[#D39448] border-b-2 border-[#D39448]"
              : "text-neutral-300")
          }
        >
          <MessageCircle size={13} />
          Comments
        </button>
        <span className="w-px bg-white/[0.08]" />
        {/* Notes war bewusst tot gestellt, weil es dahinter keine
            Notizverwaltung gibt. Fuer die Fehlersuche ist der Reiter jetzt
            benutzbar: solange er gewaehlt ist, werden KEINE Kommentare
            geholt -- und damit oeffnet der Connector auch keine zweite
            Instagram-Seite. Die erfundene Anzahl "2" ist weg, es gibt keine
            Notizen zu zaehlen. */}
        <button
          type="button"
          onClick={() => setReiter("notizen")}
          className={
            "flex-1 flex items-center justify-center gap-2 h-11 text-[12.5px] font-medium " +
            (reiter === "notizen"
              ? "text-[#D39448] border-b-2 border-[#D39448]"
              : "text-neutral-300")
          }
        >
          Notes
        </button>
      </div>

      {reiter === "notizen" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
          <p className="text-[12.5px] text-neutral-400">Notizen gibt es noch nicht.</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-600">
            Solange dieser Reiter offen ist, werden keine Kommentare geladen –
            der Connector öffnet dann auch keine zweite Instagram-Seite im
            Hintergrund. Genau dafür ist er gerade da.
          </p>
        </div>
      ) : (
      <>
      <div className="px-4 pt-3 flex items-center justify-between">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium">Top Comments</span>
        {/* Hier stand "Most Relevant" als Attrappe und wurde am 09.10.2026
            entfernt. An seiner Stelle jetzt Instagrams eigene Auswahl --
            dieselben drei Moeglichkeiten, die Instagram Web oben im
            Kommentarfenster anbietet, nur auf Englisch. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOffen((o) => !o)}
            className="flex items-center gap-1 text-[12px] text-neutral-300 hover:text-neutral-100 transition-colors"
          >
            {SORTIERUNGEN.find((s) => s.wert === sortierung)?.name}
            <ChevronDown size={13} className={sortOffen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {sortOffen && (
            <>
              {/* Klick daneben schliesst die Auswahl -- wie bei Instagram. */}
              <div className="fixed inset-0 z-30" onClick={() => setSortOffen(false)} />
              <div className="absolute right-0 top-[22px] z-40 w-[168px] rounded-xl border border-white/[0.1] bg-[#0d0d0f] shadow-[0_18px_50px_-10px_rgba(0,0,0,0.9)] overflow-hidden">
                {SORTIERUNGEN.map((s, i) => (
                  <button
                    key={s.wert}
                    type="button"
                    onClick={() => { setSortierung(s.wert); setSortOffen(false); }}
                    className={
                      "w-full flex items-center gap-2 px-3 h-10 text-left text-[12.5px] transition-colors hover:bg-white/[0.05] " +
                      (i > 0 ? "border-t border-white/[0.07] " : "") +
                      (s.wert === sortierung ? "text-neutral-50" : "text-neutral-300")
                    }
                  >
                    <Check size={13} className={s.wert === sortierung ? "text-[#D39448]" : "opacity-0"} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Die Obergrenze MUSS bleiben: ganz ohne sie zieht eine lange Liste
          die Spalte in die Hoehe, und Save to Collection rutscht aus dem
          Bild (am 09.10.2026 ausprobiert und sofort zurueckgenommen).
          Von 50vh auf 62vh angehoben -- damit fuellt die Liste die schwarze
          Flaeche, die darunter stehenblieb, ohne die Reihe zu sprengen. */}
      <div
        className="flex-1 min-h-[160px] max-h-[62vh] overflow-y-auto px-4 py-3"
        ref={listeRef}
        onScroll={async (e) => {
          // Am unteren Ende die naechsten Kommentare holen -- so wie
          // Instagram selbst nachlaedt (09.10.2026). Ohne Marke gibt es
          // nichts mehr zu holen.
          const el = e.currentTarget;
          if (!displayReelId || laedtMehr || !video) return;
          const marke = markenRef.current.get(schluessel(displayReelId));
          if (!marke) return;
          if (el.scrollTop + el.clientHeight < el.scrollHeight - 120) return;
          setLaedtMehr(true);
          const a = await fetchComments(video.id, video.sourceUrl, marke, sortierung).catch(() => null);
          setLaedtMehr(false);
          if (!a || video.id !== displayReelId) return;
          markenRef.current.set(schluessel(displayReelId), a.naechste ?? null);
          const bisher = resultsRef.current.get(schluessel(displayReelId));
          const alte = bisher?.status === "loaded" ? bisher.comments : [];
          const bekannt = new Set(alte.map((k) => k.id));
          const neue = (a.comments ?? []).filter((k) => !bekannt.has(k.id));
          if (neue.length) {
            resultsRef.current.set(schluessel(displayReelId), { status: "loaded", comments: [...alte, ...neue] });
            neuZeichnen((n) => n + 1);
          }
        }}
      >
        {!video ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[11.5px] text-neutral-600">No reel is being viewed right now.</p>
          </div>
        ) : dwelling ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[11.5px] text-neutral-600">·</p>
          </div>
        ) : loading || !result ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2">
            <Loader2 size={16} className="animate-spin text-white/40" />
            <p className="text-[11.5px] text-neutral-500">Loading comments…</p>
          </div>
        ) : result.status === "unavailable" ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 px-2">
            <p className="text-[12.5px] text-neutral-400">Comments aren't available for this reel right now.</p>
            {result.error && <p className="text-[11px] text-neutral-600">{result.error}</p>}
          </div>
        ) : result.status === "empty" ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-[12.5px] text-neutral-500">No comments yet on this reel.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.comments.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-[12.5px] leading-snug">
                {/* Profilbild wie bei Instagram. Fehlt es -- weil jemand
                    keines hat, weil Instagrams befristete Bildadresse nicht
                    mehr laedt, oder weil der alte Ableseweg gar keine Bilder
                    kennt -- steht Instagrams eigener Platzhalter dort. Der
                    Platz ist immer gleich gross, die Zeile rutscht also in
                    keinem Fall. */}
                <KommentarBild key={c.avatar ?? "ohne"} src={c.avatar ?? null} />
                <div className="min-w-0 flex-1">
                  {/* Erste Zeile wie bei Instagram: Name, Haekchen, Alter.
                      Der Text steht darunter -- so bleibt das Alter lesbar
                      und rutscht nicht mitten in den Kommentar. */}
                  <div className="flex items-center gap-[3px] min-w-0">
                    <span className="text-neutral-50 font-medium truncate">{c.username ?? "unknown"}</span>
                    {c.verifiziert && <Haekchen className="w-[13px] h-[13px] shrink-0" />}
                    {vorZeit(c.postedAt) && (
                      <span className="text-[11.5px] text-neutral-500 shrink-0 ml-[2px]">{vorZeit(c.postedAt)}</span>
                    )}
                  </div>
                  <span className="block text-neutral-400">{c.text}</span>
                  {typeof c.likeCount === "number" && (
                    <div className="text-[11px] text-neutral-600 mt-0.5">{c.likeCount.toLocaleString()} likes</div>
                  )}
                </div>
                {/* Read-only, like the rest of this panel — there's no
                    comment-level like action on the real account. */}
                <Heart size={18} className="shrink-0 text-neutral-400" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Hidden rather than removed -- no pagination/API support for loading
          more than this batch exists yet, so a disabled "View all N
          comments" button just reads as a broken promise. Re-enable by
          flipping SHOW_VIEW_ALL_COMMENTS back to true once that support is
          real. */}
      {SHOW_VIEW_ALL_COMMENTS && result?.status === "loaded" && (
        // No pagination/API support for loading more than this batch, so
        // this stays disabled rather than promising a "load more" that
        // isn't real — shown per the reference with the real fetched count.
        <div className="p-3 border-t border-white/[0.08]">
          <button
            type="button"
            disabled
            title="Loading more comments isn't available yet"
            className="w-full h-11 rounded-lg border border-white/[0.07] bg-[#111114] text-[12.5px] font-medium text-[#D39448] cursor-not-allowed"
          >
            View all {result.comments.length} comments
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
