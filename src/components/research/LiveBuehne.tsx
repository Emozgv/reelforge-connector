import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

// Die Live-Buehne (V2): zeigt Instagrams eigenes Reel, durchgereicht vom
// Connector, und schickt jeden Wisch dorthin zurueck.
//
// Der Unterschied zu V1 steckt nicht im Aussehen, sondern darin, was
// Instagram sieht. In V1 lief hier eine eigene Kopie der Videodatei --
// Instagram bekam davon nichts mit. Hier ist das Bild Instagrams Tab selbst,
// also zaehlt Instagram die Sekunden, die der Mitarbeiter wirklich
// zuschaut, und jeder Wisch ist dort ein echter Wisch.

const SERVER = "http://127.0.0.1:48211";

export type BuehnenZustand = "aus" | "verbindet" | "laeuft" | "fehler";

// So lange darf der Aufbau hoechstens brauchen. Gemessen stand die
// Verbindung bisher in unter zwei Sekunden; acht lassen reichlich Luft,
// auch wenn Instagram beim Start noch laedt.
const VERBINDUNG_FRIST_MS = 8000;

// frist: Bricht die Anfrage nach dieser Zeit selbst ab. Ohne sie kann eine
// haengende Anfrage endlos offen bleiben -- und weil die Wischsperre an ihrem
// Ende haengt, waere Wischen danach fuer den Rest der Sitzung tot.
async function ruf(pfad: string, koerper: Record<string, unknown>, frist?: number) {
  const res = await fetch(`${SERVER}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
    signal: frist ? AbortSignal.timeout(frist) : undefined,
  });
  const text = await res.text();
  const daten = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(daten.error ?? "Der Connector hat die Buehne abgelehnt.");
  return daten;
}

// Wie viel Bild bzw. Ton das Fenster hoechstens vorhalten darf, bevor es
// ausgegeben wird. Nicht 0: ein kleiner Vorrat faengt den normalen
// Ruckler beim Reelwechsel ab. Aber eben gedeckelt, statt unbegrenzt zu
// wachsen -- siehe die Begruendung bei ontrack.

// Erlaubt es, die Reel-Abfrage SOFORT anzustossen, statt auf den naechsten
// Takt zu warten. Ohne das erfuhr ReelForge erst bei der naechsten Abfrage
// (alle zwei Sekunden), welches Reel laeuft -- Likes, Bio und Kommentare
// hinkten hinterher oder zeigten noch das vorherige Reel.
let sofortFragen: (() => void) | null = null;

export function LiveBuehne({
  sessionId,
  sessionSecret,
  stumm,
  onZustand,
  onAntippen,
  pausiert,
  laedt,
  onAktuellesReel,
  onAmAnfang,
}: {
  sessionId: string;
  sessionSecret: string;
  // Der Mitarbeiter soll selbst entscheiden koennen, ob er Ton hoert --
  // Instagram zaehlt die Verweildauer so oder so, der Ton haengt nicht daran.
  stumm: boolean;
  onZustand?: (z: BuehnenZustand, meldung?: string) => void;
  // Antippen haelt Instagrams Reel an und spielt es wieder weiter -- wie ein
  // Fingertipp auf dem Handy. Der Tipp geht in Instagrams eigenen Tab,
  // nicht an unser Bild: hier laeuft nur an, was dort ankommt.
  onAntippen?: () => void;
  pausiert?: boolean;
  // Instagram laesst gerade laden: solange steht der Platzhalter ueber dem
  // Bild, genau wie auf instagram.com. Wird erst nach einer kurzen Frist
  // gesetzt -- ein normaler Wisch ist in rund 130 ms durch, und dafuer soll
  // nichts aufblitzen.
  laedt?: boolean;
  // Welches Reel gerade laeuft. In V1 wusste das der Puffer; in V2 wischt
  // der Mitarbeiter in Instagram, also weiss es nur Instagram selbst.
  onAktuellesReel?: (reel: unknown | null) => void;
  // true, solange das erste Reel der Sitzung zu sehen ist. Dann gibt es
  // nach oben nichts mehr.
  onAmAnfang?: (amAnfang: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const aufbauRef = useRef<string | null>(null);
  const versucheRef = useRef(0);
  const [neustart, setNeustart] = useState(0);
  // Als State, nicht als ref: wird in der Anzeige gelesen.
  const [gibtNochAuf, setGibtNochAuf] = useState(false);
  // Die Rueckmeldung liegt in einem ref, nicht in der Abhaengigkeitsliste:
  // sie ist bei jedem Rendern eine neue Funktion, und der Abfragetakt haette
  // sich sonst staendig selbst neu aufgesetzt.
  const meldeRef = useRef(onAktuellesReel);
  useEffect(() => { meldeRef.current = onAktuellesReel; }, [onAktuellesReel]);
  const anfangRef = useRef(onAmAnfang);
  useEffect(() => { anfangRef.current = onAmAnfang; }, [onAmAnfang]);
  const [zustand, setZustand] = useState<BuehnenZustand>("aus");
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    onZustand?.(zustand, meldung ?? undefined);
  }, [zustand, meldung, onZustand]);

  useEffect(() => {
    let abgebrochen = false;
    // React ruft Effekte im Entwicklungsmodus absichtlich doppelt auf. Ohne
    // diese Sperre baute ReelForge zwei Buehnen gleichzeitig auf, und die
    // zweite riss der ersten die Aushandlung weg ("The order of m-lines in
    // subsequent offer doesn't match", gemessen am 06.10.2026).
    if (aufbauRef.current === sessionId) return;
    aufbauRef.current = sessionId;

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      // Die Tonspur muss an einem Element haengen, sonst liefert Chrome sie
      // gar nicht erst aus -- gemessen: ohne Element bleibt sie still,
      // obwohl der Sender nachweislich Pegel hat.
      //
      // Immer setzen, nie nur "wenn noch nichts drin ist": React baut den
      // Effekt im Entwicklungsmodus absichtlich zweimal auf. Die verworfene
      // erste Verbindung hatte ihr Bild da schon hineingelegt, und als sie
      // geschlossen wurde, blieb ein totes Bild stehen, das die zweite,
      // funktionierende Verbindung nicht mehr ersetzen durfte. Genau das
      // sah man als "spielt 2-3 Sekunden und haengt sich dann auf" --
      // waehrend der Connector nachweislich 30 Bilder/s weitersendete.
      const el = videoRef.current;
      if (!el) return;
      if (el.srcObject !== ev.streams[0]) el.srcObject = ev.streams[0];
      // Ein frisch gesetzter Strom startet nicht immer von allein.
      void el.play().catch(() => {});
    };
    // Kommt die Verbindung ueberhaupt zustande? Gemessen am 08.10.2026:
    // Sie blieb auf "new" stehen, ohne jede Fehlermeldung -- der Connector
    // hatte die Antwort angenommen und die fertige Verbindung im selben
    // Moment durch einen zweiten Aufbau ersetzt (React baut im
    // Entwicklungsmodus absichtlich doppelt auf). Weil das kein Fehler ist,
    // sondern nur ein Ausbleiben, griff der vorhandene Neuversuch nie, und
    // der Mitarbeiter sass vor "Die Verbindung zum Connector ist
    // abgerissen", bis er die Seite neu lud.
    //
    // Deshalb hier nur ein Wecker: Steht nach dieser Zeit keine Verbindung,
    // wird derselbe Neuversuch ausgeloest, den es fuer Fehler schon gibt.
    // Nichts am Aufbau selbst geaendert -- das Wettrennen bleibt, es heilt
    // sich nur von allein.
    // Ein Neuversuch, zwei Ausloeser. Vorher hing er allein im catch des
    // Aufbaus -- brach die Verbindung danach weg (connectionState
    // "failed"/"disconnected"), wurde nur die Meldung gesetzt und sonst
    // nichts. Die Anzeige schrieb trotzdem "Neuer Versuch laeuft..." hin,
    // und der Mitarbeiter sass vor einer Zusage, die niemand einloeste.
    // Genau so am 09.10.2026 dreimal passiert.
    const nochmal = (grund: string) => {
      if (abgebrochen) return;
      if (versucheRef.current >= 6) { setGibtNochAuf(true); return; }
      versucheRef.current += 1;
      setGibtNochAuf(false);
      console.warn(`[buehne] Neuaufbau (${grund}), Versuch ${versucheRef.current}`);
      window.setTimeout(() => {
        if (abgebrochen) return;
        aufbauRef.current = null;
        setNeustart((n) => n + 1);
      }, 1200);
    };

    const wecker = window.setTimeout(() => {
      if (pc.connectionState === "connected") return;
      nochmal(`kam in ${VERBINDUNG_FRIST_MS / 1000}s nicht zustande`);
    }, VERBINDUNG_FRIST_MS);

    pc.onconnectionstatechange = () => {
      if (abgebrochen) return;
      if (pc.connectionState === "connected") { window.clearTimeout(wecker); setZustand("laeuft"); versucheRef.current = 0; }
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setZustand("fehler");
        setMeldung("Die Verbindung zum Connector ist abgerissen.");
        window.clearTimeout(wecker);
        nochmal(`Verbindung ${pc.connectionState}`);
      }
    };

    (async () => {
      try {
        setZustand("verbindet");
        const { angebot, aufbauId } = await ruf(`/sessions/${sessionId}/buehne`, { sessionSecret });
        if (abgebrochen) return;
        await pc.setRemoteDescription({ type: "offer", sdp: angebot });
        await pc.setLocalDescription(await pc.createAnswer());
        // Ohne Trickle -- beide Enden sitzen auf demselben Rechner, das
        // Sammeln dauert Millisekunden.
        await new Promise<void>((ok) => {
          if (pc.iceGatheringState === "complete") return ok();
          pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && ok());
          window.setTimeout(ok, 3000);
        });
        if (abgebrochen) return;
        await ruf(`/sessions/${sessionId}/buehne-antwort`, { sessionSecret, sdp: pc.localDescription?.sdp, aufbauId });

      } catch (e) {
        if (abgebrochen) return;
        setZustand("fehler");
        setMeldung(e instanceof Error ? e.message : "Die Buehne liess sich nicht aufbauen.");
        nochmal("Aufbau fehlgeschlagen");
      }
    })();

    const el = videoRef.current;
    return () => {
      abgebrochen = true;
      window.clearTimeout(wecker);
      // Das tote Bild mit wegraeumen, sonst steht es weiter im Element.
      if (el?.srcObject) el.srcObject = null;
      pc.close();
      pcRef.current = null;
      // Beim echten Verlassen freigeben, damit ein spaeterer Besuch derselben
      // Sitzung wieder aufbauen darf.
      if (aufbauRef.current === sessionId) aufbauRef.current = null;
    };
  }, [sessionId, sessionSecret, neustart]);

  // Muss dieselbe Bedingung tragen wie das Element selbst -- sonst holt
  // dieser Effekt den Ton zurueck, wenn jemand waehrend der Ladeflaeche den
  // Tonschalter umlegt.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = stumm || !!laedt;
  }, [stumm, laedt]);

  // Dauerhaft nachfragen, welches Reel Instagram gerade zeigt -- statt einmal
  // nach dem Aufbau zu fragen und zu hoffen.
  //
  // Eine einzelne Abfrage traf zu oft daneben: nach "Refresh Feed" war die
  // Seite gerade neu geladen und der Link zum sichtbaren Reel noch nicht da,
  // und die Angaben blieben dann fuer immer leer. Instagram wechselt das
  // Reel ausserdem auch von selbst, ohne dass jemand wischt -- dann waeren
  // Name, Caption und der Like-Knopf stillschweigend veraltet, und ein Like
  // traefe das falsche Reel.
  useEffect(() => {
    let gestoppt = false;
    let letzterCode: string | null = null;
    let letzteGueteWarGut = false;
    const frag = async () => {
      if (gestoppt) return;
      try {
        const a = await ruf(`/sessions/${sessionId}/buehne-aktuell`, { sessionSecret });
        if (gestoppt) return;
        const code = (a.code as string | null) ?? null;
        if (typeof a.amAnfang === "boolean") anfangRef.current?.(a.amAnfang);
        const reel = (a.reel ?? null) as { username?: string | null } | null;
        // "Gut" heisst: wir kennen wenigstens den Namen. Ohne ihn stuende in
        // der Karte @unknown und der Like-Knopf haette nichts anzuzeigen.
        const gut = !!reel && !!reel.username;
        // Nicht nur bei Codewechsel melden, sondern auch nachreichen, sobald
        // eine bessere Antwort da ist. Beim ersten Reel ist Instagrams
        // Antwort oft noch gar nicht mitgelesen (verzeichnis=0) -- wer hier
        // nur einmal meldet, laesst @unknown fuer immer stehen.
        if (code !== letzterCode || (gut && !letzteGueteWarGut)) {
          letzterCode = code;
          letzteGueteWarGut = gut;
          meldeRef.current?.(reel);
        }
      } catch { /* der naechste Versuch kommt gleich */ }
    };
    void frag();
    sofortFragen = () => { void frag(); };
    const t = window.setInterval(frag, 2000);
    return () => { gestoppt = true; sofortFragen = null; window.clearInterval(t); };
  }, [sessionId, sessionSecret]);

  return (
    <div className="absolute inset-0 bg-black" onClick={onAntippen}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Waehrend des Ladens auch stumm: der graue Platzhalter deckt nur
        // das Bild ab, Instagrams altes Reel laeuft darunter weiter und war
        // dann als einziges noch zu hoeren. Sobald das neue Reel steht,
        // kommt der Ton von allein zurueck.
        muted={stumm || !!laedt}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Ladezustand wie auf instagram.com: grauer Block in Player-Form,
          unten die Skelettzeilen fuer Name und Text. Er liegt UEBER dem
          Bild, damit beim Warten nicht das alte Reel stehenbleibt und so
          tut, als sei nichts. Sobald das neue Reel da ist, faellt er weg. */}
      {laedt && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-[#1f1f1f] pointer-events-none">
          <div className="p-4 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
              <span className="h-2.5 flex-1 max-w-[55%] rounded-full bg-white/10 animate-pulse" />
            </div>
            <span className="block h-2.5 w-[42%] rounded-full bg-white/10 animate-pulse" />
            <span className="block h-2.5 w-[62%] rounded-full bg-white/10 animate-pulse" />
          </div>
        </div>
      )}
      {pausiert && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/15 pointer-events-none">
          <span className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={22} className="text-white/90 ml-1" fill="currentColor" />
          </span>
        </div>
      )}
      {zustand !== "laeuft" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center">
          {zustand === "fehler" ? (
            <>
              <p className="text-[13px] text-neutral-100">Die Live-Ansicht kam nicht zustande.</p>
              <p className="text-[11.5px] text-neutral-500 max-w-[240px]">{meldung}</p>
              {!gibtNochAuf && (
                <p className="mt-1 text-[11px] text-neutral-600">Neuer Versuch laeuft…</p>
              )}
            </>
          ) : (
            <>
              <span className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              <p className="text-[12px] text-neutral-400">Instagram wird durchgereicht…</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Ein Wisch des Mitarbeiters geht in Instagrams eigenen Tab. Genau das ist
// der Punkt von V2: Instagram sieht einen echten Wisch, keinen Pufferwechsel.
export async function buehneEingabe(
  sessionId: string,
  sessionSecret: string,
  art: "weiter" | "zurueck" | "tippen"
) {
  // Der Wisch wartet im Connector darauf, dass Instagram wirklich gewechselt
  // hat und das neue Reel da ist -- beim Nachladen dauert das. Deshalb hier
  // mehr Luft als die frueheren 6 s.
  // 60 s, weil der Connector am Ladepunkt bis zu 55 s auf Instagram
  // wartet, statt ins Leere zu klicken. Kuerzer hiesse: der Kunde bricht
  // ab, waehrend der Connector noch korrekt wartet.
  const antwort = await ruf(`/sessions/${sessionId}/eingabe`, { sessionSecret, art }, 60000);
  // Steht das neue Reel, sofort die Angaben nachziehen.
  if (art === "weiter" || art === "zurueck") sofortFragen?.();
  return antwort;
}
