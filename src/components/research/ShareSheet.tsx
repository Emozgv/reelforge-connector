import { useEffect, useRef, useState } from "react";
import { Loader2, Check, AlertTriangle, Link as LinkIcon, X } from "lucide-react";

// Instagrams eigenes Teilen-Fenster, nachgebaut in ReelForge.
//
// Warum nachgebaut und nicht durchgereicht: Der Mitarbeiter sieht nicht
// Instagrams Seite, sondern nur den Bildstrom des Reels. Oeffnete der
// Connector dort das Teilen-Fenster, ginge es im unsichtbaren Chrome auf und
// niemand saehe es. Also liest ReelForge die Kontakte aus und zeichnet sie
// selbst; der Klick auf Senden loest drueben Instagrams eigenen Senden-Knopf
// aus.
//
// Gemessen am 09.10.2026: Teilen oeffnen -> suchen -> auswaehlen -> Feld
// "Write a message..." -> "Send". Keinen Zwischenschritt.

export interface Kontakt {
  name: string;
  kennung: string;
  bild: string | null;
}

export function ShareSheet({
  offen,
  onSchliessen,
  reelUrl,
  kontakteLaden,
  suchen,
  senden,
  aufraeumen,
}: {
  offen: boolean;
  onSchliessen: () => void;
  reelUrl: string | null;
  kontakteLaden: () => Promise<{ ok: boolean; kontakte?: Kontakt[]; fehler?: string }>;
  suchen: (begriff: string) => Promise<{ ok: boolean; kontakte?: Kontakt[]; fehler?: string }>;
  senden: (ziel: string, text: string) => Promise<{ ok: boolean; fehler?: string }>;
  aufraeumen: () => void;
}) {
  const [kontakte, setKontakte] = useState<Kontakt[] | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [ziel, setZiel] = useState("");
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Kontakt[] | null>(null);
  const [sucht, setSucht] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [stand, setStand] = useState<"bereit" | "sicher" | "laeuft" | "fertig" | "fehler">("bereit");
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const kastenRef = useRef<HTMLDivElement>(null);

  // Kontakte erst holen, wenn das Fenster wirklich aufgeht -- sonst liefe bei
  // jedem Reel eine Abfrage in Instagrams Sitzung, die niemand braucht.
  useEffect(() => {
    if (!offen) return;
    setStand("bereit");
    setFehler(null);
    setZiel("");
    setSuche("");
    setNachricht("");
    let weg = false;
    setKontakte(null);
    setLadeFehler(null);
    void kontakteLaden().then((a) => {
      if (weg) return;
      if (a.ok && a.kontakte) setKontakte(a.kontakte);
      else setLadeFehler(a.fehler ?? "Die Kontakte liessen sich nicht laden.");
    });
    setTreffer(null);
    return () => { weg = true; aufraeumen(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  // Erst wenn das Tippen kurz ruht, wird gesucht -- sonst liefe fuer jeden
  // Buchstaben eine Abfrage in Instagrams Sitzung.
  useEffect(() => {
    if (!offen) return;
    const begriff = suche.trim();
    if (!begriff) { setTreffer(null); setSucht(false); return; }
    setSucht(true);
    const t = window.setTimeout(async () => {
      const a = await suchen(begriff).catch(() => ({ ok: false }) as { ok: boolean; kontakte?: Kontakt[] });
      setSucht(false);
      setTreffer(a.ok && a.kontakte ? a.kontakte : []);
    }, 550);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, offen]);

  useEffect(() => {
    if (!offen) return;
    function aussen(e: MouseEvent) {
      if (!kastenRef.current?.contains(e.target as Node)) onSchliessen();
    }
    window.addEventListener("mousedown", aussen);
    return () => window.removeEventListener("mousedown", aussen);
  }, [offen, onSchliessen]);

  if (!offen) return null;

  // Angezeigt wird entweder Instagrams Vorschlagsliste oder das, was seine
  // eigene Suche geliefert hat -- nicht lokal gefiltert. Sonst faende man
  // nur, wer ohnehin schon vorgeschlagen wurde.
  const gefiltert = suche.trim() ? treffer : kontakte;

  async function abschicken() {
    setStand("laeuft");
    setFehler(null);
    const a = await senden(ziel.trim(), nachricht.trim());
    if (a.ok) setStand("fertig");
    else {
      setStand("fehler");
      setFehler(a.fehler ?? "Das Senden hat nicht geklappt.");
    }
  }

  return (
    <div
      ref={kastenRef}
      // Bewusst NICHT das Panel-Aussehen: das ist halbdurchsichtig und fuer
      // Flaechen gedacht, die auf dem Hintergrund liegen. Dieses Fenster
      // schwebt ueber der Kommentarspalte -- da las man den Text hindurch
      // (09.10.2026 von Emre gemeldet). Deshalb deckend, mit Schatten.
      className="absolute left-full top-1/2 -translate-y-1/2 ml-[26px] w-[300px] rounded-xl border border-white/[0.1] bg-[#0d0d0f] shadow-[0_18px_50px_-10px_rgba(0,0,0,0.9)] p-3 z-40" 
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10.5px] tracking-[0.14em] uppercase text-neutral-500 font-medium">Share</p>
        <button type="button" onClick={onSchliessen} className="text-neutral-500 hover:text-neutral-200 transition-colors">
          <X size={14} />
        </button>
      </div>

      {stand === "fertig" ? (
        <div className="flex items-center gap-2 py-3 text-[12.5px] text-emerald-400">
          <Check size={15} /> Sent to @{ziel}
        </div>
      ) : (
        <>
          {/* Suchleiste oben, wie bei Instagram. Sie filtert die
              vorgeschlagenen Kontakte -- und wer nicht darunter ist, laesst
              sich trotzdem waehlen: dann sucht der Connector den Namen
              drueben in Instagrams eigener Suche, genau wie ein Mensch. */}
          <input
            value={suche}
            onChange={(e) => { setSuche(e.target.value); setStand("bereit"); }}
            placeholder="Search"
            className="w-full h-8 px-2.5 mb-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-white/20"
          />

          <div className="max-h-[190px] overflow-y-auto -mx-1 px-1 rounded-lg">
            {kontakte === null && !ladeFehler && (
              <div className="flex items-center gap-2 py-3 text-[12px] text-neutral-500">
                <Loader2 size={13} className="animate-spin" /> Loading contacts…
              </div>
            )}
            {ladeFehler && <p className="py-2 text-[11.5px] text-amber-300/90">{ladeFehler}</p>}
            {gefiltert?.map((k, i) => {
              const wert = k.kennung || k.name;
              const aktiv = ziel === wert;
              return (
                <button
                  key={`${wert}-${i}`}
                  type="button"
                  onClick={() => { setZiel(wert); setStand("bereit"); }}
                  className={[
                    "w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg text-left transition-colors",
                    aktiv ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                  ].join(" ")}
                >
                  {k.bild ? (
                    <img src={k.bild} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-white/[0.08] shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-neutral-100 truncate">{k.name}</span>
                    {k.kennung && <span className="block text-[10.5px] text-neutral-500 truncate">@{k.kennung}</span>}
                  </span>
                  {aktiv && <Check size={13} className="text-[#D39448] shrink-0" />}
                </button>
              );
            })}
            {sucht && (
              <div className="flex items-center gap-2 py-3 text-[12px] text-neutral-500">
                <Loader2 size={13} className="animate-spin" /> Searching…
              </div>
            )}
            {!sucht && suche.trim() && gefiltert?.length === 0 && (
              <p className="py-3 text-[11.5px] text-neutral-500">Instagram found nobody for "{suche.trim()}".</p>
            )}
          </div>

          <input
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
            placeholder="Message (optional)"
            className="mt-2 w-full h-8 px-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-white/20"
          />

          {fehler && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90 leading-snug">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {fehler}
            </p>
          )}

          {/* Senden verschickt eine echte Nachricht an einen echten Menschen
              -- deshalb ein Bestaetigungsschritt davor, wie beim Blockieren. */}
          {stand === "sicher" ? (
            <div className="mt-2.5">
              <p className="text-[11.5px] text-neutral-300 leading-snug">
                Send this reel to <span className="text-neutral-50 font-medium">@{ziel}</span> from the research account?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={abschicken}
                  className="flex-1 h-8 rounded-lg bg-[#D39448] text-[#020508] text-[12px] font-medium hover:brightness-110 transition-[filter]"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => setStand("bereit")}
                  className="h-8 px-3 rounded-lg border border-white/[0.1] text-[12px] text-neutral-400 hover:text-neutral-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!ziel.trim() || stand === "laeuft"}
              onClick={() => setStand("sicher")}
              className="mt-2.5 w-full h-8 rounded-lg bg-white/[0.06] border border-white/[0.09] text-[12px] text-neutral-200 hover:bg-white/[0.1] transition-colors disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {stand === "laeuft" ? <Loader2 size={13} className="animate-spin" /> : null}
              {stand === "laeuft" ? "Sending…" : "Send to contact"}
            </button>
          )}

          <button
            type="button"
            disabled={!reelUrl}
            onClick={async () => {
              if (!reelUrl) return;
              await navigator.clipboard.writeText(reelUrl).catch(() => {});
              setKopiert(true);
              window.setTimeout(() => setKopiert(false), 1500);
            }}
            className="mt-2 w-full h-8 rounded-lg text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.05] transition-colors disabled:opacity-35 flex items-center justify-center gap-1.5"
          >
            {kopiert ? <Check size={13} className="text-[#D39448]" /> : <LinkIcon size={13} />}
            {kopiert ? "Copied" : "Copy link"}
          </button>
        </>
      )}
    </div>
  );
}
