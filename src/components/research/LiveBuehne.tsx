import { useEffect, useRef, useState } from "react";

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

async function ruf(pfad: string, koerper: Record<string, unknown>) {
  const res = await fetch(`${SERVER}${pfad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  const text = await res.text();
  const daten = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(daten.error ?? "Der Connector hat die Buehne abgelehnt.");
  return daten;
}

export function LiveBuehne({
  sessionId,
  sessionSecret,
  stumm,
  onZustand,
}: {
  sessionId: string;
  sessionSecret: string;
  // Der Mitarbeiter soll selbst entscheiden koennen, ob er Ton hoert --
  // Instagram zaehlt die Verweildauer so oder so, der Ton haengt nicht daran.
  stumm: boolean;
  onZustand?: (z: BuehnenZustand, meldung?: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [zustand, setZustand] = useState<BuehnenZustand>("aus");
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    onZustand?.(zustand, meldung ?? undefined);
  }, [zustand, meldung, onZustand]);

  useEffect(() => {
    let abgebrochen = false;
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      // Die Tonspur muss an einem Element haengen, sonst liefert Chrome sie
      // gar nicht erst aus -- gemessen: ohne Element bleibt sie still,
      // obwohl der Sender nachweislich Pegel hat.
      if (videoRef.current && !videoRef.current.srcObject) {
        videoRef.current.srcObject = ev.streams[0];
      }
    };
    pc.onconnectionstatechange = () => {
      if (abgebrochen) return;
      if (pc.connectionState === "connected") setZustand("laeuft");
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setZustand("fehler");
        setMeldung("Die Verbindung zum Connector ist abgerissen.");
      }
    };

    (async () => {
      try {
        setZustand("verbindet");
        const { angebot } = await ruf(`/sessions/${sessionId}/buehne`, { sessionSecret });
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
        await ruf(`/sessions/${sessionId}/buehne-antwort`, { sessionSecret, sdp: pc.localDescription?.sdp });
      } catch (e) {
        if (abgebrochen) return;
        setZustand("fehler");
        setMeldung(e instanceof Error ? e.message : "Die Buehne liess sich nicht aufbauen.");
      }
    })();

    return () => {
      abgebrochen = true;
      pc.close();
      pcRef.current = null;
    };
  }, [sessionId, sessionSecret]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = stumm;
  }, [stumm]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={stumm}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {zustand !== "laeuft" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-6 text-center">
          {zustand === "fehler" ? (
            <>
              <p className="text-[13px] text-neutral-100">Die Live-Ansicht kam nicht zustande.</p>
              <p className="text-[11.5px] text-neutral-500 max-w-[240px]">{meldung}</p>
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
  return await ruf(`/sessions/${sessionId}/eingabe`, { sessionSecret, art });
}
