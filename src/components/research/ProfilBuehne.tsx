import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";

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
  bedienen,
  schliessen,
}: {
  username: string;
  onSchliessen: () => void;
  oeffnen: (username: string, breite: number, hoehe: number) => Promise<{ ok: boolean; bild?: string; lauf?: string; error?: string }>;
  strom: (onBild: (bild: string) => void, signal: AbortSignal) => Promise<void>;
  bedienen: (art: "scrollen" | "klick" | "zurueck", x?: number, y?: number) => Promise<{ ok: boolean; bild?: string; error?: string }>;
  schliessen: (lauf?: string | null) => Promise<void>;
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
  // Verhindert, dass sich Bedienungen ueberholen: waehrend eine laeuft,
  // wird keine zweite abgeschickt. Sonst kaeme ein aelteres Bild nach einem
  // neueren an und die Seite spraenge zurueck.
  const offenesScrollen = useRef(0);
  const scrollLaeuft = useRef(false);

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
    const w = Math.round(kasten?.width ?? 1040);
    const h = Math.round(kasten?.height ?? 900);
    groesseRef.current = { w, h };
    setFehler(null);
    const abbruch = new AbortController();
    void oeffnen(username, w, h).then((a) => {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

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
  async function tun(art: "scrollen" | "klick" | "zurueck", x = 0, y = 0) {
    if (art === "scrollen") {
      offenesScrollen.current += y;
      if (scrollLaeuft.current) return;
      void scrollAbarbeiten();
      return;
    }
    const a = await bedienen(art, x, y).catch(() => null);
    if (a && !a.ok && a.error) setFehler(a.error);
  }

  // Zumachen heisst: drueben die Seite schliessen und dann erst die Flaeche
  // verschwinden lassen. Auch waehrend des Ladens -- dann ist die Kennung
  // noch nicht da, und der Connector raeumt die halbe Seite beim naechsten
  // Oeffnen weg.
  async function zumachen() {
    onSchliessen();
    await schliessen(kennungRef.current);
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
      {/* Nur der Weg zurueck. "Previous page", das Kreuz und der
          Instagram-Name standen hier und wurden am 10.10.2026 von Emre
          gestrichen -- der Name steht ohnehin auf der Seite darunter, und
          zwei Wege zum Schliessen braucht niemand. */}
      <div className="absolute top-0 left-0 right-0 z-20 h-11 px-3 flex items-center bg-gradient-to-b from-black/85 to-transparent">
        <button
          type="button"
          onClick={() => void zumachen()}
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12.5px] text-neutral-200 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to the reel
        </button>
      </div>

      {/* Das Bild der echten Profilseite. Ein Klick darauf wird an derselben
          Stelle drueben ausgefuehrt -- das Bild ist genau so gross gerendert
          worden wie diese Flaeche, also stimmen die Stellen eins zu eins. */}
      {/* Das Profil fuellt die Flaeche nicht mehr bis in die Ecken.
          Instagram legte seine Seite dann auf volle Breite aus und alles
          wirkte gedraengt (10.10.2026 von Emre bemaengelt: "zu voll das
          Bild"). Jetzt sitzt es als ruhiges Fenster in der Mitte, mit Luft
          ringsum -- und weil mit doppelter Punktdichte gezeichnet wird,
          bleibt es dabei scharf. */}
      <div ref={fensterRef} className="absolute inset-0 pt-11 pb-5 px-5 flex justify-center">
        <div className="w-full max-w-[1040px] h-full rounded-xl overflow-hidden bg-black shadow-[0_18px_60px_-12px_rgba(0,0,0,0.9)]">
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
