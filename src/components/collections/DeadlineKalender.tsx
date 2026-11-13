import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Kleiner Monatskalender fuer die Deadline einer Collection (13.11.2026).
// Woche beginnt am Montag. Wert ist ein reines Datum "YYYY-MM-DD" -- ohne
// Uhrzeit, damit keine Zeitzone den Tag verschiebt.

const WOCHENTAGE = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function zuText(jahr: number, monat: number, tag: number) {
  return `${jahr}-${String(monat + 1).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

export function datumAusText(wert: string): Date {
  const [j, m, t] = wert.split("-").map(Number);
  return new Date(j, m - 1, t);
}

/** "Fri, Nov 29, 2026" -- wie in Emres Vorlage. */
export function deadlineAnzeige(wert?: string | null): string {
  if (!wert) return "—";
  return datumAusText(wert).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Kurzform fuer enge Stellen: "Sat, Nov 28" -- das Jahr nur, wenn es
 *  nicht das laufende ist ("Sat, Nov 28, 2027"). */
export function deadlineKurz(wert?: string | null): string {
  if (!wert) return "—";
  const d = datumAusText(wert);
  const mitJahr = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(mitJahr ? { year: "numeric" } : {}),
  });
}

export function DeadlineKalender({
  wert,
  onWahl,
  onSchliessen,
  ausrichtung = "rechts",
}: {
  wert?: string | null;
  onWahl: (wert: string | null) => void;
  onSchliessen: () => void;
  ausrichtung?: "rechts" | "links";
}) {
  const heute = new Date();
  const start = wert ? datumAusText(wert) : heute;
  const [jahr, setJahr] = useState(start.getFullYear());
  const [monat, setMonat] = useState(start.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function draussen(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onSchliessen();
    }
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") onSchliessen();
    }
    document.addEventListener("mousedown", draussen);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", draussen);
      document.removeEventListener("keydown", taste);
    };
  }, [onSchliessen]);

  const ersterTag = new Date(jahr, monat, 1);
  const versatz = (ersterTag.getDay() + 6) % 7; // Montag = 0
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  const heuteText = zuText(heute.getFullYear(), heute.getMonth(), heute.getDate());

  const zellen: (number | null)[] = [];
  for (let i = 0; i < versatz; i++) zellen.push(null);
  for (let t = 1; t <= tageImMonat; t++) zellen.push(t);
  while (zellen.length % 7 !== 0) zellen.push(null);

  function blaettern(richtung: -1 | 1) {
    const neu = new Date(jahr, monat + richtung, 1);
    setJahr(neu.getFullYear());
    setMonat(neu.getMonth());
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={[
        "absolute top-[calc(100%+6px)] z-40 w-[252px] rounded-[11px] surface-panel-strong p-3 animate-fade-in",
        ausrichtung === "rechts" ? "right-0" : "left-0",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => blaettern(-1)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-[#afb7c3] hover:text-[#f5f5f5] hover:bg-white/[0.06]"
          title="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[12.5px] font-semibold text-[#f5f5f5]">
          {ersterTag.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => blaettern(1)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-[#afb7c3] hover:text-[#f5f5f5] hover:bg-white/[0.06]"
          title="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
        {WOCHENTAGE.map((w) => (
          <span key={w} className="h-6 flex items-center justify-center text-[10px] uppercase tracking-[0.04em] text-[#8c877e]">
            {w}
          </span>
        ))}
        {zellen.map((t, i) => {
          if (t === null) return <span key={i} className="h-8" />;
          const text = zuText(jahr, monat, t);
          const gewaehlt = text === wert;
          const istHeute = text === heuteText;
          return (
            <button
              key={i}
              onClick={() => {
                onWahl(text);
                onSchliessen();
              }}
              className={[
                "h-8 rounded-[7px] text-[12px] tabular-nums transition-colors duration-100",
                gewaehlt
                  ? "bg-[linear-gradient(113.9deg,#EAC088_0%,#D39448_100%)] text-[#020508] font-semibold"
                  : istHeute
                    ? "border border-[rgba(211,148,72,0.55)] text-[#D39448] hover:bg-white/[0.06]"
                    : "text-[#dcdcde] hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
        <button
          onClick={() => {
            onWahl(heuteText);
            onSchliessen();
          }}
          className="text-[11.5px] text-[#D39448] hover:brightness-110"
        >
          Today
        </button>
        {wert && (
          <button
            onClick={() => {
              onWahl(null);
              onSchliessen();
            }}
            className="text-[11.5px] text-[#8c877e] hover:text-[#e0664f]"
          >
            Clear deadline
          </button>
        )}
      </div>
    </div>
  );
}
