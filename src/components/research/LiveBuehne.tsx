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
  const [zustand, setZustand] = useState<BuehnenZustand>("aus");
  const [meldung, setMeldung] = useState<string | null>(null);
  // Kleine Messanzeige: der Connector sendet nachweislich lueckenlos, aber
  // das Bild steht trotzdem still -- also muss sichtbar werden, was DIESER
  // Browser mit den ankommenden Bildern macht.
  const [messung, setMessung] = useState<string>("");

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
    pc.onconnectionstatechange = () => {
      if (abgebrochen) return;
      if (pc.connectionState === "connected") { setZustand("laeuft"); versucheRef.current = 0; }
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setZustand("fehler");
        setMeldung("Die Verbindung zum Connector ist abgerissen.");
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
        setGibtNochAuf(versucheRef.current >= 6);
        // Nicht endgueltig aufgeben. Ein Fehlschlag heisst fast immer nur
        // "noch nicht soweit" -- Instagram laedt, die Seite baut sich auf,
        // eine Sitzung wird gerade gewechselt. Wer hier stehenbleibt, laesst
        // den Mitarbeiter vor einem toten Bildschirm sitzen, obwohl es zwei
        // Sekunden spaeter ginge.
        if (versucheRef.current < 6) {
          versucheRef.current += 1;
          setGibtNochAuf(false);
          window.setTimeout(() => {
            if (abgebrochen) return;
            aufbauRef.current = null;
            setNeustart((n) => n + 1);
          }, 2500);
        }
      }
    })();

    const el = videoRef.current;
    return () => {
      abgebrochen = true;
      // Das tote Bild mit wegraeumen, sonst steht es weiter im Element.
      if (el?.srcObject) el.srcObject = null;
      pc.close();
      pcRef.current = null;
      // Beim echten Verlassen freigeben, damit ein spaeterer Besuch derselben
      // Sitzung wieder aufbauen darf.
      if (aufbauRef.current === sessionId) aufbauRef.current = null;
    };
  }, [sessionId, sessionSecret, neustart]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = stumm;
  }, [stumm]);

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

  // Stand der Zaehler bei der vorigen Messung -- fuer die Veraenderung,
  // siehe die Begruendung bei stau().
  const vorhinRef = useRef<{
    video: { d: number; n: number } | null;
    audio: { d: number; n: number } | null;
  }>({ video: null, audio: null });

  // Jede Sekunde ablesen, was ankommt und was das Element daraus macht.
  useEffect(() => {
    const t = window.setInterval(async () => {
      const el = videoRef.current;
      const pc = pcRef.current;
      if (!el || !pc) return;
      let an = 0, dek = 0, fps = 0;
      // NUR ANZEIGE, greift in nichts ein.
      //
      // Emres Befund am 08.10.2026: wenn die Sitzung gekippt ist, pausiert
      // das Bild zu spaet, und beim Weiterspielen ist der Ton sofort da und
      // das Bild kommt hinterher. Beide kommen durch dieselbe Leitung -- ist
      // der Ton puenktlich und das Bild nicht, dann liegt auf DIESER Seite
      // ein Bildvorrat, der sich aufstaut. Genau den zeigen diese zwei
      // Zahlen: wie viele Millisekunden Bild bzw. Ton vor der Ausgabe
      // zwischengelagert werden. Im gesunden Fall sind beide klein und
      // ungefaehr gleich.
      let bildStau: number | null = null, tonStau: number | null = null;
      // JETZT, nicht im Mittel.
      //
      // Hier stand d/n -- aber beide Zaehler laufen seit dem Sitzungsstart
      // mit, das ergibt den DURCHSCHNITT ueber alles. Der steigt langsam und
      // kann nie wieder fallen. Genau deshalb sah es am 08.10.2026 aus wie
      // ein stetig wachsender Vorrat (9 -> 71 -> 200 -> 325 -> 422 ms),
      // obwohl das in Wahrheit nur der Mittelwert war und ueber den
      // tatsaechlichen Zustand nichts aussagte.
      //
      // Richtig ist die Veraenderung zwischen zwei Messungen: wie viel
      // Wartezeit ist fuer die Bilder angefallen, die SEIT der letzten
      // Sekunde ausgegeben wurden.
      const stau = (art: "video" | "audio", d?: number, n?: number) => {
        if (d === undefined || n === undefined) return null;
        const vorher = vorhinRef.current[art];
        vorhinRef.current[art] = { d, n };
        if (!vorher) return null;
        const dn = n - vorher.n;
        if (dn <= 0) return null;
        return Math.round(((d - vorher.d) / dn) * 1000);
      };
      try {
        (await pc.getStats()).forEach((r) => {
          if (r.type !== "inbound-rtp") return;
          if (r.kind === "video") {
            an = r.framesReceived ?? 0;
            dek = r.framesDecoded ?? 0;
            fps = r.framesPerSecond ?? 0;
            bildStau = stau("video", r.jitterBufferDelay, r.jitterBufferEmittedCount);
          } else if (r.kind === "audio") {
            tonStau = stau("audio", r.jitterBufferDelay, r.jitterBufferEmittedCount);
          }
        });
      } catch { /* egal */ }
      setMessung(
        `an ${an} · dekodiert ${dek} · ${fps}/s · ${el.paused ? "PAUSIERT" : "laeuft"}` +
          ` · bereit ${el.readyState} · ${el.videoWidth}x${el.videoHeight} · ${pc.connectionState}` +
          ` · Stau Bild ${bildStau ?? "?"}ms / Ton ${tonStau ?? "?"}ms`
      );
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 bg-black" onClick={onAntippen}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={stumm}
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
      {/* Messanzeige -- fliegt wieder raus, sobald die Ursache gefunden ist. */}
      {zustand === "laeuft" && messung && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/70 px-2 py-1 text-[9.5px] leading-tight text-emerald-300/90 font-mono pointer-events-none">
          {messung}
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
  const antwort = await ruf(`/sessions/${sessionId}/eingabe`, { sessionSecret, art }, 12000);
  // Steht das neue Reel, sofort die Angaben nachziehen.
  if (art === "weiter" || art === "zurueck") sofortFragen?.();
  return antwort;
}
