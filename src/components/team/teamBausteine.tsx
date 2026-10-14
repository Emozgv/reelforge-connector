import type { ReactNode } from "react";
import { CircleCheck, CircleSlash2, Crown, Shield, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkspaceRole } from "../../lib/permissions";
import {
  V3_BESCHRIFTUNG,
  V3_GOLD,
  V3_GRUEN,
  V3_HINWEIS,
  V3_WEISS,
  V3_ZEILE,
  V3_KACHEL_STIL,
} from "../shared/v3";

// Kleinteile des Team-Bereichs. Alle Werte hier sind am Screenshot vom
// 12.10.2026 abgeglichen, nicht geschaetzt -- wer sie aendert, aendert
// das Bild.
//
// ZUR EHRLICHKEIT DER ANZEIGE: Die Vorlage zeigt fuenf Rollen. ReelForge
// hat drei (owner, manager, va), und zwar in der Datenbank und in jeder
// Rechtepruefung. Erfundene Rollen wuerden Rechte behaupten, die niemand
// vergeben kann -- deshalb stehen hier die drei echten.

// DIE FLAECHEN SIND GESTAFFELT -- das ist der Unterschied zwischen
// "hochwertig" und "billig", und er war am 13.10.2026 der Hauptbefund:
// vorher lagen Panel, Feld und Zeichenkachel praktisch auf derselben
// Helligkeit, dadurch wirkte alles platt.
//
//   seite   #0a0a0c   der Grund, auf dem alles liegt
//   panel   #141417   die grossen Kaesten -- heller als die Seite
//   feld    #1b1b1f   Eingaben und Zeilen IM Panel -- heller als das Panel
//   kachel  #1e1e23   die Traeger der Zeichen -- wieder dunkler, mit Rand
//
// Die Raender ziehen dieselbe Treppe mit.
// Team benutzt KEINE eigenen Flaechen- und Randwerte mehr.
//
// Am 13.10.2026 hatte ich hier eine eigene Palette gebaut -- neutrale
// Graustufen, eigene Raender, eigene Abstufungen. Emres Befund: "Billing
// ist die beste Seite, Team muss diesen Vibe haben, 100%." Und er hat
// recht: eine zweite Palette neben Billings bedeutet zwangslaeufig, dass
// beide auseinanderlaufen.
//
// Deshalb kommt jetzt alles aus demselben Baukasten wie Billing
// (shared/v3): Panels, Kacheln, Zeichenfelder, Knoepfe, Schriftfarben.
// FARBE ist nur noch die Bruecke dorthin -- wer hier etwas aendert,
// aendert es fuer Billing mit.
export const FARBE = {
  text: V3_WEISS,            // #f5f5f5
  zweit: V3_BESCHRIFTUNG,    // #afb7c3
  hinweis: V3_HINWEIS,       // #b9c0ca
  zeile: V3_ZEILE,           // #b8c0cb
  leise: "#8c877e",          // Billings gedaempfter Ton
  gold: V3_GOLD,             // #D39448
  goldHell: "#EAC088",
  gruen: V3_GRUEN,           // #63c07f
  blau: "#5eb1ff",
  lila: "#b98cff",
  rot: "#ff8a8a",
  rand: "#1a130b",           // der warme Rand aus V3
  randHell: "#26262b",       // Billings Rand fuer Eingaben und Knoepfe
  feld: "#17171a",           // Billings Feldflaeche
} as const;

export const ROLLE_ZEICHEN: Record<WorkspaceRole, { Zeichen: typeof Crown; farbe: string }> = {
  owner: { Zeichen: Crown, farbe: FARBE.goldHell },
  manager: { Zeichen: Shield, farbe: FARBE.blau },
  va: { Zeichen: Eye, farbe: FARBE.zweit },
};

export const ROLLE_WAS_DARF: Record<WorkspaceRole, string> = {
  owner: "Full access to all features and settings.",
  manager: "Team, billing and all content — no role changes.",
  va: "Sees everything, changes nothing about the team.",
};

/** Was dieses Mitglied tatsaechlich darf -- abgeleitet aus Rolle und
 *  Plan-Recht, nicht aus einem erfundenen Feld. */
export function zugriff(
  rolle: WorkspaceRole,
  darfPlan: boolean
): { label: string; ton: Ton; Zeichen: LucideIcon } {
  if (rolle === "owner") return { label: "Full access", ton: "gruen", Zeichen: CircleCheck };
  if (rolle === "manager")
    return darfPlan
      ? { label: "Full access", ton: "gruen", Zeichen: CircleCheck }
      : { label: "Limited", ton: "gold", Zeichen: CircleSlash2 };
  return { label: "Read only", ton: "grau", Zeichen: Eye };
}

export type Ton = "gruen" | "gold" | "grau" | "blau" | "lila";

// EXAKT Billings Plaketten (13.10.2026).
//
// Die Werte sind eins zu eins aus BillingPage.tsx uebernommen: dunkle
// getoente Flaeche, farbige Kante, farbige Schrift und ein bewusst
// schwacher Schein -- viel schwaecher als die Kante, damit die Pille
// sich von der Zeile abhebt, ohne laut zu werden.
//
// Davor hatte ich hier zweimal etwas Eigenes: erst durchscheinend mit
// Rand (zu blass), dann massiv gefuellt ohne Rand (zu klotzig). Beides
// war nicht Billing. Wer diese Werte aendert, sollte sie zuerst dort
// aendern.
const TON: Record<Ton, { text: string; grund: string; rand: string; schein: string }> = {
  gruen: { text: "#63c07f", grund: "rgba(99,192,127,0.14)", rand: "rgba(99,192,127,0.30)", schein: "rgba(99,192,127,0.13)" },
  gold: { text: "#EAC088", grund: "rgba(255,190,41,0.12)", rand: "rgba(255,190,41,0.32)", schein: "rgba(255,190,41,0.13)" },
  grau: { text: "#d4d4d4", grund: "rgba(255,255,255,0.045)", rand: "rgba(255,255,255,0.11)", schein: "rgba(255,255,255,0.05)" },
  blau: { text: "#79b6ff", grund: "rgba(59,146,255,0.12)", rand: "rgba(59,146,255,0.30)", schein: "rgba(59,146,255,0.13)" },
  lila: { text: "#c79bff", grund: "rgba(167,106,255,0.12)", rand: "rgba(167,106,255,0.30)", schein: "rgba(167,106,255,0.13)" },
};

/** Billings Plan-Pille: 28 hoch, Radius 7, 12 px halbfett, mit Zeichen. */
export function Plakette({
  ton,
  icon: Zeichen,
  children,
}: {
  ton: Ton;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const t = TON[ton];
  return (
    <span
      className="inline-flex h-[28px] items-center gap-[6px] rounded-[7px] px-[11px] text-[12px] font-semibold whitespace-nowrap"
      style={{ background: t.grund, border: `1px solid ${t.rand}`, color: t.text, boxShadow: `0 0 10px ${t.schein}` }}
    >
      {Zeichen && <Zeichen size={12} strokeWidth={2} />}
      {children}
    </span>
  );
}

/** Die Rollenplakette traegt KEIN Zeichen -- die Krone steht im
 *  Screenshot neben dem Namen, nicht in der Plakette. */
export function RollenPlakette({ rolle }: { rolle: WorkspaceRole }) {
  const ton: Ton = rolle === "owner" ? "gold" : rolle === "manager" ? "blau" : "grau";
  return (
    <Plakette ton={ton} icon={ROLLE_ZEICHEN[rolle].Zeichen}>
      {rolle === "va" ? "VA" : rolle === "owner" ? "Owner" : "Manager"}
    </Plakette>
  );
}

/** Billings Statuspille: rund, Rand, leuchtender Punkt. Die Werte
 *  stammen aus der Dienste-Tabelle in BillingPage.tsx. */
export function StatusPunkt({ ton, children }: { ton: Ton; children: ReactNode }) {
  const t = TON[ton];
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-[14px] border px-[9px] py-[4px] text-[11.5px] whitespace-nowrap"
      style={{
        color: t.text,
        background: t.grund,
        borderColor: t.rand,
        boxShadow: `0 0 10px ${t.schein}`,
      }}
    >
      <span
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ background: t.text, boxShadow: `0 0 6px ${t.text}8c` }}
      />
      {children}
    </span>
  );
}

/** Das Namenszeichen. Gedeckte Toene wie im Screenshot -- der Besitzer
 *  traegt Gold, alle anderen ein ruhiges Blau/Violett. */
export function Namenszeichen({
  name,
  size = 32,
  gold = false,
}: {
  name: string;
  size?: number;
  gold?: boolean;
}) {
  const kuerzel = (name || "?").trim().slice(0, 2).toUpperCase();
  const toene = ["#4d5f86", "#564a82", "#425f72", "#5f4e75", "#485a74"];
  let summe = 0;
  for (const z of name) summe += z.charCodeAt(0);
  const grund = gold ? "linear-gradient(113.9deg,#EAC088 0%,#D39448 100%)" : toene[summe % toene.length];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.35),
        letterSpacing: "0.02em",
        color: gold ? "#020508" : "#e7ecf5",
        background: grund,
        // Derselbe Schein wie auf Billings goldenen Flaechen -- ohne ihn
        // sah das Zeichen aufgeklebt aus (Emre, 13.10.2026).
        border: gold ? "1px solid #D39448" : "none",
        boxShadow: gold
          ? "inset 0 1px 3px rgba(255,236,206,0.3), 0 0 18px rgba(211,148,72,0.28)"
          : "none",
      }}
    >
      {kuerzel}
    </span>
  );
}

// Das Zeichenfeld kommt aus shared/v3 (ZeichenFeld) -- dasselbe
// goldumrandete Quadrat wie in Billing. Die eigene Fassung, die hier
// stand, ist am 13.10.2026 entfallen.

export function vorZeit(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const std = Math.floor(min / 60);
  if (std < 24) return `${std} hour${std === 1 ? "" : "s"} ago`;
  const tage = Math.floor(std / 24);
  return `${tage} day${tage === 1 ? "" : "s"} ago`;
}

/** Der ueberlappende Avatar-Stapel in der Creator-Spalte.
 *
 *  Gezeigt werden die ECHTEN Creator des Arbeitsbereichs, denn jedes
 *  Mitglied arbeitet auf dem ganzen Bestand -- eine Zuordnung einzelner
 *  Creator zu einzelnen Mitgliedern gibt es nicht. Der Stapel ist damit
 *  keine Attrappe, sondern genau das, worauf dieses Mitglied Zugriff hat. */
export function AvatarStapel({
  leute,
  zeigen = 3,
  size = 22,
}: {
  leute: { id: string; name: string; bild?: string | null; farbe?: string }[];
  zeigen?: number;
  size?: number;
}) {
  if (!leute.length) return <span className="text-[12.5px] text-[#6b7078]">—</span>;
  const sichtbar = leute.slice(0, zeigen);
  const rest = leute.length - sichtbar.length;
  return (
    <span className="flex items-center">
      {sichtbar.map((l, i) => (
        <span
          key={l.id}
          className="flex items-center justify-center overflow-hidden rounded-full font-semibold"
          style={{
            width: size,
            height: size,
            marginLeft: i === 0 ? 0 : -Math.round(size * 0.32),
            zIndex: zeigen - i,
            fontSize: Math.round(size * 0.36),
            color: "#e7ecf5",
            background: l.farbe ?? "#3f4a62",
            border: "2px solid #0d0f11",
          }}
          title={l.name}
        >
          {l.bild ? (
            <img src={l.bild} alt="" className="h-full w-full object-cover" />
          ) : (
            (l.name || "?").slice(0, 1).toUpperCase()
          )}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="flex items-center justify-center rounded-full font-medium"
          style={{
            height: size,
            minWidth: size,
            marginLeft: -Math.round(size * 0.32),
            paddingInline: 6,
            fontSize: Math.round(size * 0.38),
            color: "#b9c0ca",
            background: String(V3_KACHEL_STIL.background),
            border: "2px solid #0d0f11",
          }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
