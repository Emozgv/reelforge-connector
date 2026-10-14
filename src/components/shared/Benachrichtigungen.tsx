import { useState } from "react";
import { Bell } from "lucide-react";
import type { ActivityFeedItem } from "../../state/useActivityFeed";
import type { ActivityEventType } from "../../lib/activityMapping";

// Die Glocke mit ihrem Klappfenster.
//
// Sie stand bis zum 14.10.2026 in der Seitenleiste. Emre wollte sie
// stattdessen oben rechts im Dashboard haben, wo ohnehin schon eine
// Glocke stand -- die war bis dahin nur Zierde. Damit es nicht zwei
// Fassungen gibt, liegt sie jetzt hier und wird von dort geholt.

// Die Glocke ist fuer Dinge, die eine Unterbrechung wert sind -- nicht
// fuer jede Zeile im Verlauf (der steht vollstaendig im Dashboard und in
// der Chronik einer Collection).
const NOTABLE_EVENT_TYPES: ActivityEventType[] = [
  "submission_created",
  "regeneration_requested",
  "delivery_eta_set",
  "submission_finished",
  "submission_check_inbox",
];

// Gelesen/ungelesen ist eine Sache dieses Browsers, kein Zustand im
// Server -- passend zur Annahme "ein Arbeitsbereich je Browser".
const LAST_READ_KEY = "reelforge_notifications_last_read_at";

export function Benachrichtigungen({
  activity,
  onOpenCollection,
  /** Wohin das Fenster aufklappt. In der Seitenleiste nach rechts, oben
   *  rechts im Dashboard nach links. */
  richtung = "links",
  knopfKlasse,
  zeichenGroesse = 15,
}: {
  activity: { items: ActivityFeedItem[]; loading: boolean };
  onOpenCollection: (collectionId: string) => void;
  richtung?: "links" | "rechts";
  knopfKlasse?: string;
  zeichenGroesse?: number;
}) {
  const [offen, setOffen] = useState(false);
  const [zuletztGelesen, setZuletztGelesen] = useState(() => Number(localStorage.getItem(LAST_READ_KEY) ?? 0));

  const meldungen = activity.items.filter((item) => NOTABLE_EVENT_TYPES.includes(item.eventType));
  const ungelesen = meldungen.length > 0 && new Date(meldungen[0].createdAtRaw).getTime() > zuletztGelesen;

  function alleGelesen() {
    const jetzt = Date.now();
    localStorage.setItem(LAST_READ_KEY, String(jetzt));
    setZuletztGelesen(jetzt);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOffen((v) => !v)}
        title="Notifications"
        className={
          knopfKlasse ??
          "press-feedback relative flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full text-[#d7dae0] transition-colors duration-150 hover:bg-white/[0.06]"
        }
      >
        <Bell size={zeichenGroesse} strokeWidth={1.7} />
        {ungelesen && (
          <span
            className="pulse-live absolute right-[5px] top-[5px] h-[6px] w-[6px] rounded-full bg-[#ff5a5a]"
            style={{ ["--pulse-live-color" as string]: "rgba(255,90,90,0.55)" }}
          />
        )}
      </button>

      {offen && (
        <div
          onMouseLeave={() => setOffen(false)}
          className={[
            "absolute top-[38px] z-40 w-72 rounded-xl surface-panel-strong p-1 animate-fade-in",
            richtung === "links" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
            <p className="text-[10.5px] uppercase tracking-wide text-neutral-500">Notifications</p>
            {ungelesen && (
              <button
                onClick={alleGelesen}
                className="text-[10.5px] text-neutral-500 transition-colors duration-150 hover:text-[#D39448]"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {meldungen.length === 0 && <p className="px-2.5 py-3 text-[11.5px] text-neutral-600">Nothing yet.</p>}
            {meldungen.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.collectionId) onOpenCollection(item.collectionId);
                  setOffen(false);
                }}
                disabled={!item.collectionId}
                className="w-full rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-white/[0.06] disabled:hover:bg-transparent"
              >
                <p className="text-[12px] leading-snug text-neutral-50">{item.message}</p>
                <p className="mt-0.5 text-[10.5px] text-neutral-600">{item.relativeTime}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
