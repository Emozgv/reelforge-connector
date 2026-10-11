import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { panelStil, KARTE_FUELLUNG } from "../../lib/panelLook";

// ===========================================================================
// DESIGN V3 -- die gemeinsamen Bausteine
// ===========================================================================
//
// Entstanden auf der Billing-Seite (11.10.2026) und von Emre als neue
// Grundlage fuer den ganzen Workspace freigegeben. Alles, was hier steht,
// war vorher in BillingPage.tsx vergraben -- dort war es nicht
// wiederverwendbar, und jede weitere Seite haette es abgeschrieben.
//
// Flaeche und Rand kommen weiterhin aus panelLook.ts: dort haengt der
// Schalter V1/V2/V3, und der soll die EINE Stelle bleiben, an der man die
// Flaechen der App umstellt.
//
// Die Schrift-Grautoene stammen aus Figma (aus der unteren Reihe des
// Billing-Entwurfs ausgelesen, gleiches Design-System):
//   Weiss         #f5f5f5   Beschriftungen und Ueberschriften
//   Beschriftung  #afb7c3   11 px
//   Hinweis       #b9c0ca   9-10 px
//   Zeilentext    #b8c0cb   12 px
// Gold und Gruen sind unsere eigenen: #D39448 / #EAC088 / #63c07f.

/** Die grosse Flaeche: Panel, Sektion, Karte. */
export const V3_KARTE = "rounded-[11px] border";
export const V3_KARTE_STIL: CSSProperties = panelStil();

/** Die Flaeche IN einer Karte: Kennzahl-Kacheln, Status-Felder, Streifen. */
export const V3_KACHEL = "rounded-[9px] border border-[#1a130b]";
export const V3_KACHEL_STIL: CSSProperties = { background: KARTE_FUELLUNG };

/** Schriftfarben. */
export const V3_WEISS = "#f5f5f5";
export const V3_BESCHRIFTUNG = "#afb7c3";
export const V3_HINWEIS = "#b9c0ca";
export const V3_ZEILE = "#b8c0cb";
export const V3_GOLD = "#D39448";
export const V3_GRUEN = "#63c07f";

// Der Traeger hinter jedem Zeichen: ein abgerundetes QUADRAT mit feinem
// Goldrahmen, nicht die runde Scheibe aus Figma. Emres Screenshot ist die
// Referenz, und dort ist es durchgaengig ein Quadrat (11.10.2026).
export function ZeichenFeld({
  icon: Icon,
  size = 36,
  radius = 10,
  rund = false,
  glanz = false,
}: {
  icon: LucideIcon;
  size?: number;
  radius?: number;
  /** Runder Traeger statt abgerundetem Quadrat -- so steht es in der
   *  Vorlage in der Billing-Uebersicht. */
  rund?: boolean;
  /** Ein weicher goldener Schein nach aussen. Gibt den Kacheln Leben,
   *  statt sie flach wirken zu lassen (Emre, 11.10.2026). */
  glanz?: boolean;
}) {
  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: rund ? 999 : radius,
        // Der Schein ist bewusst zurueckhaltend: Emre fand ihn in der
        // ersten Fassung zu hell (11.10.2026). Rund die Haelfte davon --
        // sichtbar als Tiefe, nicht als Leuchten.
        background: "linear-gradient(140deg, rgba(211,148,72,0.10) 0%, rgba(211,148,72,0.035) 100%)",
        border: "1px solid rgba(211,148,72,0.24)",
        boxShadow: glanz
          ? "0 0 14px rgba(211,148,72,0.085), inset 0 1px 0 rgba(255,221,180,0.07)"
          : "inset 0 1px 0 rgba(255,221,180,0.05)",
      }}
    >
      <Icon size={Math.round(size * 0.47)} style={{ color: V3_GOLD }} strokeWidth={1.8} />
    </span>
  );
}

export function GoldKnopf({
  children,
  onClick,
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "h-[33px] px-[14px] rounded-[6px] text-[11px] font-semibold text-[#020508]",
        "bg-[linear-gradient(113.9deg,#EAC088_0%,#D39448_100%)]",
        "border border-[#D39448] shadow-[inset_0px_1px_3px_0px_rgba(255,236,206,0.3)]",
        "shadow-[0_0_18px_rgba(211,148,72,0.28)] hover:brightness-[1.06] hover:shadow-[0_0_22px_rgba(211,148,72,0.38)]",
        "transition-[filter,box-shadow] duration-150 disabled:opacity-45 disabled:shadow-none disabled:cursor-default",
        "inline-flex items-center justify-center gap-1.5",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function RahmenKnopf({
  children,
  onClick,
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "h-[33px] px-[15px] rounded-[6px] text-[11px] text-[#f2f0ef]",
        "border border-[#26262b] bg-[#17171a]",
        "hover:border-[#3a3a40] transition-colors duration-150 disabled:opacity-45 disabled:cursor-default",
        "inline-flex items-center justify-center gap-2",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Die goldene Verweis-Zeile oben rechts in den unteren Karten.
export function GoldVerweis({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-[4px] text-[11px] text-[#D39448]/55 cursor-default"
    >
      {children}
      <ArrowRight size={13} />
    </span>
  );
}

export function AbschnittKopf({
  icon,
  titel,
  unterzeile,
  rechts,
  chip,
}: {
  icon: LucideIcon;
  titel: string;
  unterzeile?: string;
  rechts?: ReactNode;
  chip?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-[13px]">
      <ZeichenFeld icon={icon} size={38} radius={10} glanz />
      <div className="min-w-0 flex-1 pt-[1px]">
        <div className="flex items-center gap-[9px]">
          {/* Eine Groesse fuer ALLE Abschnittskoepfe. Vorher gab es zwei --
              dadurch waren "Workspace & Creator Access" und "AI video
              production services" groesser als der Rest (Emre, 11.10.2026). */}
          <h2 className="text-[15px] font-semibold text-[#f5f5f5] leading-[20px] tracking-[-0.1px]">
            {titel}
          </h2>
          {chip}
        </div>
        {unterzeile && <p className="mt-[3px] text-[11px] leading-[15px] text-[#8c877e]">{unterzeile}</p>}
      </div>
      {rechts && <div className="shrink-0 flex items-center gap-[10px]">{rechts}</div>}
    </div>
  );
}

export function GruenerChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[4px] rounded-[12px] border border-[rgba(99,192,127,0.28)] bg-[rgba(99,192,127,0.14)] px-[7px] py-[3px] text-[9px] text-[#63c07f]">
      {children}
    </span>
  );
}

/** Taucht weich auf, statt dazustehen.
 *
 *  Beim Oeffnen der Seite sollen die Abschnitte nacheinander erscheinen --
 *  ein kurzes Aufblenden mit einem Hauch Bewegung von unten. Mit
 *  "verzoegerung" staffelt man sie (Emre, 11.10.2026).
 *
 *  Wer im Betriebssystem weniger Bewegung eingestellt hat, bekommt alles
 *  sofort und ohne Bewegung -- das ist keine Spielerei, sondern eine
 *  Einstellung, die Leute aus gutem Grund setzen.
 */
export function Auftritt({
  verzoegerung = 0,
  children,
  className,
}: {
  verzoegerung?: number;
  children: ReactNode;
  className?: string;
}) {
  const [da, setDa] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDa(true);
      return;
    }
    const id = window.setTimeout(() => setDa(true), verzoegerung);
    return () => window.clearTimeout(id);
  }, [verzoegerung]);

  return (
    <div
      className={className}
      style={{
        opacity: da ? 1 : 0,
        transform: da ? "none" : "translateY(10px)",
        transition: "opacity 520ms cubic-bezier(0.22,1,0.36,1), transform 520ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {children}
    </div>
  );
}

/** Eine Zahl, die hochzaehlt.
 *
 *  Laeuft von null auf ihren Wert, schnell am Anfang und sanft auslaufend.
 *  "formatieren" bekommt den Zwischenwert -- so zaehlt auch ein Geldbetrag
 *  mit Waehrungszeichen richtig hoch.
 */
export function Zahl({
  wert,
  dauer = 900,
  formatieren,
}: {
  wert: number;
  dauer?: number;
  formatieren?: (n: number) => string;
}) {
  const [stand, setStand] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStand(wert);
      return;
    }
    let laeuft = 0;
    const beginn = performance.now();
    const schritt = (jetzt: number) => {
      const p = Math.min(1, (jetzt - beginn) / dauer);
      const weich = 1 - Math.pow(1 - p, 3);
      setStand(wert * weich);
      if (p < 1) laeuft = requestAnimationFrame(schritt);
    };
    laeuft = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(laeuft);
  }, [wert, dauer]);

  return <>{formatieren ? formatieren(stand) : Math.round(stand)}</>;
}

/** Ein Ring, der einen Anteil zeigt -- und sich weich mitbewegt.
 *
 *  Gedacht fuer den Muenzkreis bei den Credits: voll, wenn alle Kredite da
 *  sind, halb bei der Haelfte, und bei null bleibt nur die duenne Spur
 *  stehen. Aendert sich der Wert, laeuft der Ring in einer halben Sekunde
 *  dorthin, statt zu springen (Emre, 11.10.2026).
 */
export function Ring({
  anteil,
  groesse = 54,
  staerke = 3,
  children,
}: {
  /** 0 bis 100. */
  anteil: number;
  groesse?: number;
  staerke?: number;
  children?: ReactNode;
}) {
  const r = (groesse - staerke) / 2;
  const umfang = 2 * Math.PI * r;

  // Die Zeichenflaeche ist groesser als der Kreis.
  //
  // Vorher war sie exakt so gross -- dadurch wurde der weiche Schein an
  // ihrem Rand abgeschnitten, und man sah ein Viereck um den Kreis herum
  // (Emre, 11.10.2026). Der Rand hier gibt dem Schein Platz; sichtbar ist
  // davon nichts, die Flaeche bleibt durchsichtig.
  const luft = 14;
  const feld = groesse + luft * 2;
  const mitte = feld / 2;

  // Beim ersten Erscheinen laeuft der Ring von null auf seinen Wert, statt
  // fertig dazustehen. Danach bewegt ihn jede Aenderung weich weiter --
  // beides ueber dieselbe Uebergangszeit (Emre, 11.10.2026).
  const [gezeigt, setGezeigt] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGezeigt(anteil));
    return () => cancelAnimationFrame(id);
  }, [anteil]);

  const gefuellt = Math.max(0, Math.min(100, gezeigt)) / 100;

  return (
    <span className="relative flex items-center justify-center shrink-0" style={{ width: groesse, height: groesse }}>
      <svg
        width={feld}
        height={feld}
        viewBox={`0 0 ${feld} ${feld}`}
        className="absolute -rotate-90 pointer-events-none"
        style={{ left: -luft, top: -luft, overflow: "visible" }}
      >
        {/* Die Spur -- immer sichtbar, auch bei null. */}
        <circle cx={mitte} cy={mitte} r={r} fill="none" stroke="rgba(211,148,72,0.22)" strokeWidth={staerke} />
        {/* Der gefuellte Teil. */}
        <circle
          cx={mitte}
          cy={mitte}
          r={r}
          fill="none"
          stroke={V3_GOLD}
          strokeWidth={staerke}
          strokeLinecap="round"
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - gefuellt)}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)",
            filter: gefuellt > 0 ? "drop-shadow(0 0 4px rgba(211,148,72,0.35))" : undefined,
          }}
        />
      </svg>
      {children}
    </span>
  );
}

export function Balken({ anteil }: { anteil: number }) {
  return (
    <div className="h-[6px] flex-1 min-w-0 rounded-[20px] bg-[#232327] overflow-hidden">
      <div
        // Der Schein auf der gefuellten Strecke stammt aus Emres Vorlage --
        // er macht den Balken lebendig, ohne ihn dicker zu machen.
        className="h-full rounded-[20px] bg-[linear-gradient(90deg,#EAC088_0%,#D39448_100%)] shadow-[0_0_8px_rgba(211,148,72,0.3)]"
        style={{ width: `${Math.max(0, Math.min(100, anteil))}%` }}
      />
    </div>
  );
}

