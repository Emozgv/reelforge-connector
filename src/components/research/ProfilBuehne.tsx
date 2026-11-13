import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowLeft, ArrowRight, AlertTriangle, Volume1, Volume2, VolumeX, Bookmark } from "lucide-react";
import type { ReelVideo } from "../../types";

// Gewaehlte Lautstaerke der Profil-Buehne -- je Geraet gemerkt, damit sie
// beim naechsten Profil wieder gilt. Nur Bequemlichkeit: fehlt der
// Speicher, gilt 100 %.
const LAUTSTAERKE_SCHLUESSEL = "rf-profil-lautstaerke";
function lautstaerkeLesen(): number {
  try {
    const v = Number(window.localStorage.getItem(LAUTSTAERKE_SCHLUESSEL));
    return Number.isFinite(v) && v >= 0 && v <= 1 && window.localStorage.getItem(LAUTSTAERKE_SCHLUESSEL) !== null ? v : 1;
  } catch {
    return 1;
  }
}

// Die zweite Buehne: Instagrams echte Profilseite, ohne den Feed anzufassen.
//
// Warum ueberhaupt eine zweite: Klickt man auf Instagram selbst auf den
// Namen, verlaesst man den Reel-Feed -- genau das, was eine Research-Sitzung
// nicht darf (von Emre am 10.10.2026 so benannt). Der Connector oeffnet das
// Profil deshalb auf einer EIGENEN Seite im selben angemeldeten Browser.
//
// Zuerst stand hier ein Bild nach jeder Bedienung. Das traegt nicht: Emre
// hat sofort eine Story geoeffnet, und eine Story ist ein Video -- davon
// zeigte ein Standbild nur den Ladekringel (10.10.2026). Jetzt schickt
// Chrome die Seite als laufende Bildfolge, so wie Entwicklerwerkzeuge eine
// Seite aus der Ferne zeigen.
//
// Ton ist darin NICHT enthalten; der kommt getrennt.
//
// Das Bild ist KEIN Nachbau: Bio, Link, Highlights, die Reiter und
// Markierungen sind Instagrams eigene Seite. Darum kann daran auch nichts
// veralten.

export function ProfilBuehne({
  username,
  onSchliessen,
  oeffnen,
  strom,
  ton,
  tonAntwort,
  bedienen,
  schliessen,
  aktuell,
  onSpeichern,
  istGespeichert,
}: {
  username: string;
  onSchliessen: () => void;
  oeffnen: (username: string, breite: number, hoehe: number, anzeige?: number) => Promise<{ ok: boolean; bild?: string; lauf?: string; error?: string }>;
  strom: (onBild: (bild: string) => void, signal: AbortSignal) => Promise<void>;
  ton: () => Promise<{ ok: boolean; angebot?: string; error?: string }>;
  tonAntwort: (sdp: string) => Promise<void>;
  bedienen: (art: "scrollen" | "klick" | "zurueck" | "schweben", x?: number, y?: number) => Promise<{ ok: boolean; bild?: string; error?: string }>;
  schliessen: (lauf?: string | null) => Promise<void>;
  // Welches Reel ist drueben geoeffnet -- und auf Wunsch das fertige Reel
  // fuer die bestehende Speicherfunktion.
  aktuell: (holen: boolean) => Promise<{ code: string | null; video?: ReelVideo; error?: string }>;
  onSpeichern: (video: ReelVideo) => void;
  istGespeichert: (id: string) => boolean;
}) {
  const [bild, setBild] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const flaecheRef = useRef<HTMLDivElement>(null);
  // Das innere Fenster: DAS ist die Groesse, in der Instagram seine Seite
  // legen soll. Vorher wurde die ganze Flaeche gemessen.
  const fensterRef = useRef<HTMLDivElement>(null);
  // Die Groesse, mit der der Connector die Seite gerendert hat. Nur damit
  // laesst sich ein Klick auf dem Bild in einen Klick auf der echten Seite
  // umrechnen.
  const groesseRef = useRef<{ w: number; h: number }>({ w: 1440, h: 900 });
  // Kennung der drueben offenen Seite -- nur damit laesst sie sich gezielt
  // schliessen.
  const kennungRef = useRef<string | null>(null);
  // Ton: eigene Leitung, weil die Bildfolge keinen traegt.
  const audioRef = useRef<HTMLAudioElement>(null);
  const tonPcRef = useRef<RTCPeerConnection | null>(null);
  const [stumm, setStumm] = useState(true);
  // Lautstaerke 0..1. Wirkt auf genau das Element, das den Ton des Profils
  // abspielt -- also hoerbar, nicht nur als Anzeige.
  const [lautstaerke, setLautstaerke] = useState<number>(() => lautstaerkeLesen());
  const [reglerOffen, setReglerOffen] = useState(false);
  const reglerZuRef = useRef<number | null>(null);
  // Das drueben geoeffnete Reel (Code aus Instagrams Adresse) und der
  // Zustand des Speicherns.
  const [offenesReel, setOffenesReel] = useState<string | null>(null);
  const [holtReel, setHoltReel] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);
  // Verhindert, dass sich Bedienungen ueberholen: waehrend eine laeuft,
  // wird keine zweite abgeschickt. Sonst kaeme ein aelteres Bild nach einem
  // neueren an und die Seite spraenge zurueck.
  const offenesScrollen = useRef(0);
  const scrollLaeuft = useRef(false);

  // Mausbewegung nach drueben -- aber nicht jede einzelne.
  //
  // Eine Maus meldet sich hundertmal je Sekunde. Jede davon einzeln
  // hinueberzuschicken waere Unsinn: es genuegt, WO der Zeiger zuletzt war.
  // Deshalb immer nur eine Meldung unterwegs; was waehrenddessen passiert,
  // ueberschreibt nur die gemerkte Position.
  const letzteMaus = useRef<{ x: number; y: number } | null>(null);
  const mausLaeuft = useRef(false);

  // Das Mausrad muss von Hand abgefangen werden.
  //
  // React haengt sein onWheel als "passiven" Zuhoerer ganz oben an die
  // Seite -- und ein passiver Zuhoerer DARF das Scrollen nicht aufhalten.
  // Deshalb scrollte ReelForge dahinter mit, obwohl wir es verboten hatten
  // (10.10.2026 von Emre gemeldet). Von Hand angehaengt mit passive:false
  // greift das Verbot.
  useEffect(() => {
    const el = flaecheRef.current;
    if (!el) return;
    const amRad = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Nicht jedes Geraet zaehlt in Pixeln: manche melden Zeilen, manche
      // ganze Seiten. Ohne Umrechnung kaeme bei einem Zeilen-Rad fast
      // nichts an und bei einem Seiten-Rad viel zu viel.
      const proZeile = 16;
      const faktor = e.deltaMode === 1 ? proZeile : e.deltaMode === 2 ? el.clientHeight : 1;
      void tun("scrollen", 0, e.deltaY * faktor);
    };
    el.addEventListener("wheel", amRad, { passive: false });
    return () => el.removeEventListener("wheel", amRad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let weg = false;
    const innen = fensterRef.current?.firstElementChild?.getBoundingClientRect();
    const kasten = innen ?? flaecheRef.current?.getBoundingClientRect();
    // Wie breit ist das Fenster drueben?
    //
    // Bewusst NICHT so breit wie die Flaeche hier, sondern fest 1920 --
    // Chrome bekommt diese Breite, und das Bild wird bei uns passend
    // verkleinert.
    //
    // Der Grund ist Instagram selbst: sein Raster richtet sich nach der
    // Fensterbreite. Bei der Breite, die auf einem Notebook-Bildschirm
    // uebrig bleibt, zeigt es drei Kacheln je Reihe; erst bei annaehernd
    // Vollbild werden es vier. Mit 1920 sind es fuenf -- also deutlich
    // mehr Uebersicht, ohne an Instagram selbst irgendetwas zu aendern
    // (10.10.2026 von Emre an seinem eigenen Chrome gegengeprueft und so
    // entschieden).
    //
    // Auf 0 setzen heisst: wieder genau so breit wie die Flaeche hier.
    const BUEHNE_BREITE_FEST = 1920;
    const kastenB = Math.round(kasten?.width ?? 1040);
    const kastenH = Math.round(kasten?.height ?? 900);
    // Seitenverhaeltnis beibehalten, sonst verzerrt das Bild.
    const w = BUEHNE_BREITE_FEST || kastenB;
    const h = BUEHNE_BREITE_FEST ? Math.round((BUEHNE_BREITE_FEST * kastenH) / kastenB) : kastenH;
    groesseRef.current = { w, h };
    setFehler(null);
    const abbruch = new AbortController();
    // kastenB ist die Breite, in der das Bild bei uns WIRKLICH zu sehen
    // ist -- der Connector braucht beide Zahlen fuer die Schildgroesse.
    void oeffnen(username, w, h, kastenB).then((a) => {
      kennungRef.current = a.lauf ?? null;
      if (weg) return;
      if (!a.ok) {
        // "Cancelled" ist kein Fehler, sondern unser eigener Schutz, wenn
        // ein neueres Oeffnen dazwischenkam -- das darf dem Mitarbeiter
        // nicht als Stoerung vor die Nase fallen (10.10.2026).
        if (a.error !== "Cancelled.") setFehler(a.error ?? "Couldn't open this profile.");
        return;
      }
      setFehler(null);
      if (a.bild) setBild(a.bild);
      // Tonleitung aufbauen. Scheitert sie, bleibt das Profil nutzbar --
      // nur eben stumm.
      void tonAufbauen();
      // Ab jetzt laeuft das Bild von selbst weiter.
      void strom((b) => {
        if (weg) { URL.revokeObjectURL(b); return; }
        // Die vorige Adresse freigeben, sonst haelt der Browser jedes je
        // empfangene Bild im Speicher fest.
        setBild((alt) => { if (alt?.startsWith("blob:")) URL.revokeObjectURL(alt); return b; });
      }, abbruch.signal);
    });
    // Beim Abbauen wird NUR der Bildstrom getrennt, nicht drueben
    // zugemacht.
    //
    // Vorher hing das Schliessen am Lebenszyklus dieser Flaeche. ReelForge
    // baut sie beim ersten Oeffnen aus Entwicklungsgruenden mehrfach auf
    // und ab -- und so machte ein Abbau die Seite zu, die gerade erst
    // aufgegangen war: im Protokoll "geoeffnet" und 12 ms spaeter
    // "geschlossen", auf dem Schirm ein ewiger Ladekringel (10.10.2026 von
    // Emre gemeldet, erster Klick tat nichts).
    //
    // Jetzt schliesst nur, wer auch wirklich auf Schliessen drueckt. Bleibt
    // doch einmal eine Seite stehen, raeumt der Connector sie beim
    // naechsten Oeffnen und beim Sitzungsende weg.
    return () => {
      weg = true;
      abbruch.abort();
      tonPcRef.current?.close();
      tonPcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Lautstaerke auf das Ton-Element anwenden und merken.
  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = lautstaerke;
    try {
      window.localStorage.setItem(LAUTSTAERKE_SCHLUESSEL, String(lautstaerke));
    } catch {
      /* ohne Speicher gilt die Lautstaerke eben nur bis zum Schliessen */
    }
  }, [lautstaerke]);

  // Welches Reel ist drueben offen? Der Connector liest das aus Instagrams
  // Adresse -- eine Rueckfrage an den eigenen Rechner, keine an Instagram.
  // Darum darf es oft geschehen: so zeigt der Knopf auch nach dem
  // Weiterblaettern im Instagram-Player immer auf das gerade offene Reel.
  useEffect(() => {
    if (!bild) return;
    let weg = false;
    let laeuft = false;
    const t = window.setInterval(async () => {
      if (laeuft) return;
      laeuft = true;
      const a = await aktuell(false).catch(() => null);
      laeuft = false;
      if (weg || !a) return;
      setOffenesReel((alt) => {
        if (alt !== a.code) setSpeicherFehler(null);
        return a.code;
      });
    }, 700);
    return () => {
      weg = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!bild]);

  async function speichern() {
    if (!offenesReel || holtReel) return;
    setSpeicherFehler(null);
    setHoltReel(true);
    const gemeint = offenesReel;
    const a = await aktuell(true).catch(() => null);
    setHoltReel(false);
    // Nur speichern, was WIRKLICH noch offen ist -- hat der Mitarbeiter
    // waehrenddessen weitergeblaettert, nicht das falsche Reel nehmen.
    if (!a?.video || a.code !== gemeint) {
      setSpeicherFehler(a?.code && a.code !== gemeint ? "The reel changed — click again to save the open one." : a?.error ?? "Couldn't read this reel.");
      return;
    }
    onSpeichern(a.video);
  }

  function reglerZeigen() {
    if (reglerZuRef.current !== null) window.clearTimeout(reglerZuRef.current);
    reglerZuRef.current = null;
    setReglerOffen(true);
  }
  function reglerVerbergen() {
    if (reglerZuRef.current !== null) window.clearTimeout(reglerZuRef.current);
    reglerZuRef.current = window.setTimeout(() => setReglerOffen(false), 220);
  }

  // Ein Zustand fuer Knopf und Regler: stumm ODER Lautstaerke null heisst
  // "nichts zu hoeren" -- genau das zeigt das Zeichen.
  const hoerbar = !stumm && lautstaerke > 0;
  const reelId = offenesReel ? `instagram:${offenesReel}` : null;
  const schonGespeichert = reelId ? istGespeichert(reelId) : false;

  // Scrollen und Klicken gehen nach drueben; das Ergebnis sieht man im
  // laufenden Bild, es muss also keins zurueckkommen.
  //
  // Beim Scrollen gilt: IMMER nur ein Befehl unterwegs. Alles, was
  // waehrenddessen am Rad passiert, wird aufaddiert und als EIN Befehl
  // nachgeschickt, sobald der vorige durch ist.
  //
  // Vorher ging alle 60 ms ein Paket raus, egal ob das vorige angekommen
  // war. Bei einem freilaufenden Mausrad (Emres Logitech) stapelten die
  // sich: Er hoerte auf zu scrollen, drueben wurde aber noch abgearbeitet,
  // was in der Schlange stand -- es lief nach und ruckelte
  // (10.10.2026 von Emre genau so beschrieben). Jetzt hoert es auf, wenn er
  // aufhoert.
  async function tun(art: "scrollen" | "klick" | "zurueck" | "schweben", x = 0, y = 0) {
    if (art === "scrollen") {
      offenesScrollen.current += y;
      if (scrollLaeuft.current) return;
      void scrollAbarbeiten();
      return;
    }
    const a = await bedienen(art, x, y).catch(() => null);
    if (a && !a.ok && a.error) setFehler(a.error);
  }

  async function tonAufbauen() {
    const a = await ton().catch(() => null);
    if (!a?.ok || !a.angebot) return;
    const pc = new RTCPeerConnection();
    tonPcRef.current = pc;
    pc.ontrack = (ev) => {
      const el = audioRef.current;
      if (el && el.srcObject !== ev.streams[0]) {
        el.srcObject = ev.streams[0];
        void el.play().catch(() => {});
      }
    };
    await pc.setRemoteDescription({ type: "offer", sdp: a.angebot });
    await pc.setLocalDescription(await pc.createAnswer());
    // WARTEN, bis die Verbindungsadressen gesammelt sind -- genau wie die
    // Buehne es tut.
    //
    // Ohne das ging die Antwort ohne Adressen raus, der Connector sendete
    // ins Leere und es blieb still: "Tonleitung steht" im Protokoll, aber
    // kein Ton (10.10.2026 von Emre gemeldet). Beide Enden sitzen auf
    // demselben Rechner, das Sammeln dauert Millisekunden.
    await new Promise<void>((fertig) => {
      if (pc.iceGatheringState === "complete") return fertig();
      pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && fertig());
      window.setTimeout(fertig, 3000);
    });
    await tonAntwort(pc.localDescription?.sdp ?? "");
  }

  // Zumachen heisst: drueben die Seite schliessen und dann erst die Flaeche
  // verschwinden lassen. Auch waehrend des Ladens -- dann ist die Kennung
  // noch nicht da, und der Connector raeumt die halbe Seite beim naechsten
  // Oeffnen weg.
  async function zumachen() {
    onSchliessen();
    await schliessen(kennungRef.current);
  }

  async function mausAbarbeiten() {
    mausLaeuft.current = true;
    try {
      while (letzteMaus.current) {
        const { x, y } = letzteMaus.current;
        letzteMaus.current = null;
        await bedienen("schweben", x, y).catch(() => {});
      }
    } finally {
      mausLaeuft.current = false;
    }
  }

  async function scrollAbarbeiten() {
    scrollLaeuft.current = true;
    try {
      while (offenesScrollen.current !== 0) {
        const summe = offenesScrollen.current;
        offenesScrollen.current = 0;
        await bedienen("scrollen", 0, summe).catch(() => {});
      }
    } finally {
      scrollLaeuft.current = false;
    }
  }

  return (
    <div
      ref={flaecheRef}
      className="absolute inset-0 z-30 rounded-xl overflow-hidden border border-[#1a130b] bg-[#060607] overscroll-contain"
    >
      {/* Links der Weg zurueck, rechts der Ton -- und dazwischen ein
          Hinweis mit Pfeil darauf.
          Grund: Instagrams eigener Lautsprecher ist auf der Seite sichtbar,
          zeigt aber den Zustand SEINES Players. Unser Ton wird davor
          abgegriffen -- sein Knopf bewirkt hier also nichts. Ohne Hinweis
          drueckt jemand darauf, hoert keinen Unterschied und haelt den Ton
          fuer kaputt.
          Hier stand zuerst "freezes the video". Das war am 08.10.2026 auf
          der BUEHNE gemessen, nicht auf der Profilseite -- und Emre hat es
          am 10.10.2026 ausprobiert: nichts passierte. Eine Warnung, die
          nicht zutrifft, ist schlechter als keine, deshalb steht jetzt da,
          was belegt ist.
          Ausblenden haben wir versucht und wieder verworfen -- es machte
          die Seite quaelend langsam. */}
      {/* Rechts derselbe Randabstand wie beim Fenster darunter (20 Punkte).
          Vorher waren es 12 -- der Tonknopf stand damit naeher am Rand als
          alles andere und klebte optisch (10.10.2026 von Emre bemerkt). */}
      <div className="absolute top-0 left-0 right-0 z-20 h-14 pl-3 pr-5 flex items-center bg-gradient-to-b from-black/90 via-black/60 to-transparent">
        <button
          type="button"
          onClick={() => void zumachen()}
          className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-[12.5px] text-neutral-200 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to the reel
        </button>

        {/* Save to Collection fuer das drueben geoeffnete Reel. Erscheint nur,
            wenn Instagram gerade ein Reel zeigt (Adresse /reel/... oder
            /p/...), und geht durch dieselbe Speicherfunktion wie ueberall. */}
        {offenesReel && (
          <div className="ml-3 flex items-center gap-2.5">
            <button
              type="button"
              disabled={holtReel || schonGespeichert}
              onClick={() => void speichern()}
              title={schonGespeichert ? "Already saved in this session" : "Save the open reel to a collection"}
              className="h-9 px-3.5 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium text-[#2a1c0e] hover:brightness-110 transition-[filter] duration-150 disabled:opacity-50 disabled:cursor-default press-feedback"
              style={{ background: "linear-gradient(90deg, #D39448, #EAC088)", boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)" }}
            >
              {holtReel ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} fill={schonGespeichert ? "currentColor" : "none"} />}
              {schonGespeichert ? "Saved" : "Save to Collection"}
            </button>
            {speicherFehler && <span className="text-[11.5px] text-amber-300/90 max-w-[260px] leading-tight">{speicherFehler}</span>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {/* Zwei Zeilen wie urspruenglich -- aber um 7 Punkte nach unten
              geschoben, damit die ERSTE Zeile auf derselben Hoehe steht wie
              "Back to the reel" links.
              Gemessen am 10.10.2026: mittig gesetzt lag die erste Zeile auf
              41, die linke Beschriftung auf 48. Der Block als Ganzes war
              also mittig, die Zeilen aber nicht auf einer Linie. */}
          <p className="text-right text-[11.5px] leading-tight text-neutral-300 translate-y-[7px]">
            Sound is controlled here
            <span className="block text-[10.5px] text-neutral-500">
              Instagram&rsquo;s own sound icon has no effect here
            </span>
          </p>
          <ArrowRight size={16} className="text-[#D39448] shrink-0" />
          {/* Ton: Klick schaltet stumm/laut, beim Drueberfahren erscheint der
              Lautstaerkeregler darunter (13.11.2026). */}
          <div className="relative" onMouseEnter={reglerZeigen} onMouseLeave={reglerVerbergen}>
            <button
              type="button"
              onClick={() => {
                if (hoerbar) setStumm(true);
                else {
                  // Laut schalten bei Lautstaerke null waere wieder still --
                  // dann auf die Haelfte.
                  if (lautstaerke === 0) setLautstaerke(0.5);
                  setStumm(false);
                }
              }}
              title={hoerbar ? "Turn sound off" : "Turn sound on"}
              className={[
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                !hoerbar
                  ? "bg-[#D39448] text-[#020508] hover:brightness-110"
                  : "bg-white/[0.12] text-white hover:bg-white/[0.18]",
              ].join(" ")}
            >
              {!hoerbar ? <VolumeX size={18} /> : lautstaerke < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
            </button>
            {reglerOffen && (
              <div className="absolute right-0 top-full pt-2 z-30">
                <div className="w-[188px] rounded-xl surface-panel-strong px-3 py-2.5 flex items-center gap-2.5 animate-fade-in">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={stumm ? 0 : Math.round(lautstaerke * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setLautstaerke(v);
                      // Wer den Regler bewegt, will hoeren -- ausser er zieht
                      // ihn ganz nach links.
                      setStumm(v === 0);
                    }}
                    aria-label="Volume"
                    className="flex-1 accent-[#D39448] cursor-pointer"
                  />
                  <span className="w-9 text-right text-[11.5px] tabular-nums text-neutral-300">
                    {stumm ? 0 : Math.round(lautstaerke * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} autoPlay muted={stumm} className="hidden" />

      {/* Das Bild der echten Profilseite. Ein Klick darauf wird an derselben
          Stelle drueben ausgefuehrt -- das Bild ist genau so gross gerendert
          worden wie diese Flaeche, also stimmen die Stellen eins zu eins. */}
      {/* Das Profil fuellt die Flaeche nicht mehr bis in die Ecken.
          Instagram legte seine Seite dann auf volle Breite aus und alles
          wirkte gedraengt (10.10.2026 von Emre bemaengelt: "zu voll das
          Bild"). Jetzt sitzt es als ruhiges Fenster in der Mitte, mit Luft
          ringsum -- und weil mit doppelter Punktdichte gezeichnet wird,
          bleibt es dabei scharf. */}
      <div ref={fensterRef} className="absolute inset-0 pt-14 pb-5 px-5 flex justify-center">
        {/* Breite der Buehne. Sie ist zugleich die Fensterbreite drueben: was
            hier steht, wird beim Oeffnen an Chrome weitergegeben. 1040 war die
            alte Deckelung; auf 1600 angehoben, um zu sehen, ob Instagrams
            Raster bei mehr Platz mehr als drei pro Reihe zeigt (10.10.2026,
            von Emre gewuenscht -- meine Vermutung war, dass es mittig auf
            fester Breite bleibt, geprueft war das nicht). */}
          <div className="w-full max-w-[1600px] h-full rounded-xl overflow-hidden bg-black shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9)]">
          {bild && (
            <img
              src={bild}
              alt=""
              draggable={false}
              onClick={(e) => {
                const k = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - k.left) / k.width) * groesseRef.current.w;
                const y = ((e.clientY - k.top) / k.height) * groesseRef.current.h;
                void tun("klick", Math.round(x), Math.round(y));
              }}
              // Verlaesst die Maus das Bild, sagen wir das nach drueben.
              // Sonst bleibt Instagram bei der zuletzt beruehrten Kachel
              // haengen und zeigt ihre Zahlen weiter, auch wenn man laengst
              // woanders ist: wir schicken sonst nur, WO die Maus ist --
              // nie, dass sie weg ist. Die minus eins ist das Zeichen
              // dafuer; wohin der Zeiger drueben wirklich faehrt,
              // entscheidet der Connector.
              onMouseLeave={() => {
                letzteMaus.current = { x: -1, y: -1 };
                if (!mausLaeuft.current) void mausAbarbeiten();
              }}
              onMouseMove={(e) => {
                const k = e.currentTarget.getBoundingClientRect();
                letzteMaus.current = {
                  x: Math.round(((e.clientX - k.left) / k.width) * groesseRef.current.w),
                  y: Math.round(((e.clientY - k.top) / k.height) * groesseRef.current.h),
                };
                if (!mausLaeuft.current) void mausAbarbeiten();
              }}
              className="w-full h-full object-cover object-top cursor-pointer select-none"
            />
          )}
        </div>
      </div>

      {!bild && !fehler && (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin text-white/50" />
          <p className="text-[12.5px] text-neutral-400">Opening @{username} on the research account…</p>
        </div>
      )}

      {fehler && (
        <div className="h-full flex flex-col items-center justify-center gap-2 px-10 text-center">
          <AlertTriangle size={18} className="text-amber-300/90" />
          <p className="text-[12.5px] text-neutral-300">{fehler}</p>
          <p className="text-[11.5px] text-neutral-500">Your reel session is untouched — go back and keep swiping.</p>
        </div>
      )}

    </div>
  );
}
