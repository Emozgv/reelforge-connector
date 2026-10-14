import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

// Bausteine des Dashboards (14.10.2026, nach Emres Screenshot).
//
// Die Farben und Masse stammen aus docs/DESIGN-DNA.md -- also aus
// Billing. Nichts hier erfindet eine eigene Palette.

export const D = {
  flaeche: "linear-gradient(120deg, rgba(16,19,21,0.667) 0%, rgba(11,14,17,0.733) 100%)",
  karte: "#0d0d0f",
  rand: "#1a130b",
  randNeutral: "#26262b",
  weiss: "#f5f5f5",
  beschriftung: "#afb7c3",
  hinweis: "#b9c0ca",
  zeile: "#b8c0cb",
  leise: "#8c877e",
  gold: "#D39448",
  goldHell: "#EAC088",
  gruen: "#63c07f",
  rot: "#e0664f",
  blau: "#5eb1ff",
  lila: "#c79bff",
} as const;

/** Das goldumrandete Zeichenquadrat -- derselbe Traeger wie in Billing. */
export function Zeichenkachel({
  icon: Zeichen,
  size = 40,
  farbe = D.gold,
}: {
  icon: LucideIcon;
  size?: number;
  farbe?: string;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: "linear-gradient(140deg, rgba(211,148,72,0.10) 0%, rgba(211,148,72,0.035) 100%)",
        border: "1px solid rgba(211,148,72,0.24)",
        boxShadow: "0 0 14px rgba(211,148,72,0.085), inset 0 1px 0 rgba(255,221,180,0.07)",
      }}
    >
      <Zeichen size={Math.round(size * 0.45)} strokeWidth={1.8} style={{ color: farbe }} />
    </span>
  );
}

/** Die kleine Trendzahl neben dem Wert.
 *
 *  Sie erscheint NUR, wenn es dafuer wirklich Verlaufsdaten gibt. Wo das
 *  Produkt keine Historie fuehrt, bleibt der Platz leer -- eine erfundene
 *  Prozentzahl waere schlimmer als gar keine. */
export function Trend({ prozent }: { prozent: number | null }) {
  if (prozent === null) return null;
  const hoch = prozent >= 0;
  const farbe = hoch ? D.gruen : D.rot;
  const Pfeil = hoch ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-[2px] text-[12px] font-semibold" style={{ color: farbe }}>
      <Pfeil size={12} strokeWidth={2.6} />
      {hoch ? "+" : ""}
      {Math.round(prozent)}%
    </span>
  );
}

/** Die kleine Verlaufslinie unten rechts in der Kennzahlkachel.
 *
 *  Gezeichnet aus ECHTEN Wochenwerten. Gibt es keine, wird nichts
 *  gezeichnet. */
export function Verlaufslinie({ werte, farbe }: { werte: number[]; farbe: string }) {
  if (werte.length < 2) return null;
  // Auch eine Linie aus lauter Nullen wird gezeichnet: sie sagt "in
  // diesen Wochen ist nichts passiert", und das ist eine richtige
  // Aussage, keine erfundene. Am 14.10.2026 hatte ich sie hier
  // ausgeblendet -- dadurch fehlte in den Kacheln ploetzlich das
  // Diagramm. Falsch gedacht.
  const max = Math.max(...werte);

  const b = 68;
  const h = 28;
  const min = Math.min(...werte, 0);
  const spanne = Math.max(1, max - min);
  const xy = werte.map((w, i) => {
    const x = (i / (werte.length - 1)) * b;
    const y = h - ((w - min) / spanne) * (h - 5) - 3;
    return [x, y] as const;
  });
  const linie = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const flaeche = `${linie} ${b},${h} 0,${h}`;
  const id = `vl-${farbe.replace("#", "")}`;

  return (
    <svg width={b} height={h} viewBox={`0 0 ${b} ${h}`} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={farbe} stopOpacity={0.3} />
          <stop offset="100%" stopColor={farbe} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={flaeche} fill={`url(#${id})`} />
      <polyline
        points={linie}
        fill="none"
        stroke={farbe}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${farbe}80)` }}
      />
    </svg>
  );
}

/** Die Statuspille -- Billings Bauart: Rand, leise Fuellung, Schein. */
export function Pille({
  farbe,
  icon: Zeichen,
  children,
}: {
  farbe: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex h-[24px] items-center gap-[5px] rounded-[7px] px-[9px] text-[11px] font-medium whitespace-nowrap"
      style={{ color: farbe, background: `${farbe}1f`, border: `1px solid ${farbe}4d`, boxShadow: `0 0 10px ${farbe}1f` }}
    >
      {Zeichen && <Zeichen size={11} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/** Der Kopf eines Panels: Titel, Unterzeile, rechts etwas Kleines. */
export function PanelKopf({
  titel,
  unter,
  rechts,
}: {
  titel: string;
  unter?: string;
  rechts?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-[20px] tracking-[-0.1px]" style={{ color: D.weiss }}>
          {titel}
        </h2>
        {unter && (
          <p className="mt-[3px] text-[11px] leading-[15px]" style={{ color: D.leise }}>
            {unter}
          </p>
        )}
      </div>
      {rechts && <div className="shrink-0">{rechts}</div>}
    </div>
  );
}
