import { ChevronRight, Clapperboard, FolderOpen, Layers, MoreHorizontal, Send } from "lucide-react";
import type { Creator, CreatorPackage } from "../../types";
import { creatorSetupStatus } from "../../lib/creatorMapping";
import { planBadgeLabel } from "../../lib/planDisplay";
import { formatRelativeTime } from "../../lib/relativeTime";
import type { CreatorStats } from "./creatorStats";
import { GOLD_RING } from "../../lib/goldRing";
import { KARTE_FUELLUNG } from "../../lib/panelLook";

// Die Karte aus dem Referenzbild (1695x928). Alle Masse sind daran gemessen
// und mit 0,89 auf die Breite gebracht, auf der wirklich gearbeitet wird
// (1509) -- sonst fuellt dieselbe Zeichnung mehr Flaeche und wirkt
// herangezoomt. Gemessen: Karte 670x210, Bild darin 148x192, Abstand
// zwischen den Karten 20. Mal 0,89: 596x187, Bild 132x171, Abstand 18.

// Der Entwurf kennt genau zwei Einrichtungszustaende, nicht drei. "Draft" und
// "In progress" fallen deshalb zusammen: entweder ist ein Creator fertig
// eingerichtet oder eben nicht.
export function einrichtungsZustand(creator: Creator): "fertig" | "offen" {
  return creatorSetupStatus(creator) === "ready" ? "fertig" : "offen";
}

const ZUSTAND = {
  // Fuellungen am Entwurf gemessen (#092113 und #251908); die Schrift ist
  // dort heller und weicher als ein volles Signalgruen bzw. -gelb.
  fertig: { label: "Setup complete", farbe: "#a4e8be", fuellung: "#092113", rand: "rgba(164,232,190,0.18)" },
  offen: { label: "Setup incomplete", farbe: "#f0c987", fuellung: "#251908", rand: "rgba(240,201,135,0.18)" },
} as const;

function Kennzahl({ Zeichen, wert, label }: { Zeichen: typeof Layers; wert: number; label: string }) {
  return (
    <span className="flex items-start gap-1.5 min-w-0">
      <Zeichen size={12} className="shrink-0 mt-[3px] text-[#9a9ba0]" />
      <span className="min-w-0">
        <span className="block text-[12.5px] leading-[15px] text-[#fbfbfc]">{wert}</span>
        <span className="block text-[10px] leading-[13px] text-[#c2c3c6] truncate">{label}</span>
      </span>
    </span>
  );
}

export function CreatorCard({
  creator,
  stats,
  plan,
  onOpen,
}: {
  creator: Creator;
  stats: CreatorStats;
  plan: CreatorPackage | undefined;
  onOpen: () => void;
}) {
  const zustand = ZUSTAND[einrichtungsZustand(creator)];
  const initialen = creator.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Im Entwurf steht links ein Hochformat. Dafuer gibt es im Bestand die
  // Referenzfotos des Creators; fehlen sie, bleibt die Flaeche in seiner
  // Farbe statt ein fremdes Bild zu zeigen.
  const bild = creator.referencePhotos[0] ?? creator.profileImage;
  const marken = creator.traits.slice(0, 4);
  const mehr = creator.traits.length - marken.length;

  return (
    <div
      onClick={onOpen}
      // Tiefe aus der DNA, Flaechen aus dem Entwurf. Bewusst OHNE
      // press-feedback: dessen Schrumpfen beim Druecken hat in Collections
      // dazu gefuehrt, dass Klicks auf der grossen Flaeche danebengingen.
      style={{ background: KARTE_FUELLUNG, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), inset 0 0 0 1px rgba(0,0,0,0.4), 0 16px 32px -18px rgba(0,0,0,0.8), ${GOLD_RING}` }}
      className="group relative flex h-[200px] p-[7px] rounded-xl border border-[#1a130b] hover:border-[#2f2113] transition-colors duration-150 cursor-pointer"
    >
      <span className="w-[132px] h-full shrink-0 rounded-[9px] overflow-hidden bg-black/40 block">
        {bild ? (
          <img src={bild} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="block w-full h-full" style={{ background: creator.avatarColor, opacity: 0.35 }} />
        )}
      </span>

      <span className="flex-1 min-w-0 flex flex-col pl-[22px] pr-7 pt-[17px]">
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-[44px] h-[44px] rounded-full shrink-0 flex items-center justify-center text-[13px] font-medium text-[#020508] overflow-hidden"
            style={creator.profileImage ? undefined : { background: creator.avatarColor }}
          >
            {creator.profileImage ? (
              <img src={creator.profileImage} alt={creator.name} className="w-full h-full object-cover" />
            ) : (
              initialen
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-serif font-medium text-[19px] leading-[23px] text-white truncate">
              {creator.name}
            </span>
            <span className="block text-[12px] text-[#cfd0d3] truncate">{creator.handle}</span>
          </span>

          <span
            className="shrink-0 h-[24px] px-2.5 rounded-[12px] flex items-center gap-1.5 text-[10.5px] whitespace-nowrap"
            style={{ background: zustand.fuellung, color: zustand.farbe, boxShadow: `inset 0 0 0 1px ${zustand.rand}` }}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: zustand.farbe }} />
            {zustand.label}
          </span>

          {/* Im Entwurf sitzt hier ein Menue. Eine eigene Handlung dahinter
              gibt es im Bestand nicht -- gemeint ist das Oeffnen der Karte,
              und das tut schon die ganze Flaeche. */}
          <span
            aria-hidden
            className="ml-auto shrink-0 text-[#8c8d91] group-hover:text-[#dcdcde] transition-colors duration-150"
          >
            <MoreHorizontal size={16} />
          </span>
        </span>

        <span className="mt-3">
          <span className="inline-flex items-center h-[21px] px-2.5 rounded-[6px] border border-[#242424] bg-[#191919] text-[10.5px] text-[#dedfe1]">
            {planBadgeLabel(plan)}
          </span>
        </span>

        <span className="mt-3 grid grid-cols-4 gap-2">
          <Kennzahl Zeichen={FolderOpen} wert={stats.collectionsCount} label="Collections" />
          <Kennzahl Zeichen={Layers} wert={stats.totalConcepts} label="Concepts" />
          <Kennzahl Zeichen={Send} wert={stats.delivered} label="Delivered" />
          <Kennzahl Zeichen={Clapperboard} wert={stats.activeSubmissions} label="In production" />
        </span>

        <span className="mt-4 flex items-center gap-2 min-w-0">
          {marken.map((t) => (
            <span
              key={t}
              className="shrink-0 h-[22px] px-2.5 rounded-[6px] border border-[#1c1c1c] bg-[#121212] text-[10.5px] text-[#d6d7d4] flex items-center whitespace-nowrap"
            >
              {t}
            </span>
          ))}
          {mehr > 0 && (
            <span className="shrink-0 h-[22px] px-2.5 rounded-[6px] border border-[#1c1c1c] bg-[#121212] text-[10.5px] text-[#a8a9ad] flex items-center">
              +{mehr}
            </span>
          )}
          {creator.updatedAt && (
            <span className="ml-auto shrink-0 text-[10.5px] text-[#9a9ba0] whitespace-nowrap">
              Updated {formatRelativeTime(creator.updatedAt).toLowerCase()}
            </span>
          )}
        </span>
      </span>

      <span
        aria-hidden
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full border border-[#1a1710] bg-[#0d0c09] flex items-center justify-center text-[#9a9ba0] group-hover:text-[#EAC088] group-hover:border-[#5a3b1b] transition-colors duration-150"
      >
        <ChevronRight size={14} />
      </span>
    </div>
  );
}
