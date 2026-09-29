import { ChevronRight, Clapperboard, FolderOpen, Layers, MoreHorizontal, Send } from "lucide-react";
import type { Creator, CreatorPackage } from "../../types";
import { creatorSetupStatus } from "../../lib/creatorMapping";
import { planBadgeLabel } from "../../lib/planDisplay";
import { formatRelativeTime } from "../../lib/relativeTime";
import type { CreatorStats } from "./creatorStats";

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
  fertig: { label: "Setup complete", farbe: "#3fd096", fuellung: "rgba(18,56,42,0.55)", rand: "rgba(63,208,150,0.25)" },
  offen: { label: "Setup incomplete", farbe: "#f2b552", fuellung: "rgba(63,48,20,0.55)", rand: "rgba(242,181,82,0.25)" },
} as const;

function Kennzahl({ Zeichen, wert, label }: { Zeichen: typeof Layers; wert: number; label: string }) {
  return (
    <span className="flex items-start gap-1.5 min-w-0">
      <Zeichen size={12} className="shrink-0 mt-[3px] text-[#6f7075]" />
      <span className="min-w-0">
        <span className="block text-[12.5px] leading-[15px] text-[#efeff2]">{wert}</span>
        <span className="block text-[10px] leading-[13px] text-[#77787d] truncate">{label}</span>
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
      className="group relative flex h-[187px] p-[7px] rounded-xl border border-[#18191b] bg-[#050607] hover:border-[#2b2419] transition-colors duration-150 cursor-pointer"
    >
      <span className="w-[132px] h-full shrink-0 rounded-[9px] overflow-hidden bg-black/40 block">
        {bild ? (
          <img src={bild} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="block w-full h-full" style={{ background: creator.avatarColor, opacity: 0.35 }} />
        )}
      </span>

      <span className="flex-1 min-w-0 flex flex-col pl-[22px] pr-7">
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
            <span className="block font-serif font-medium text-[19px] leading-[23px] text-[#f2f0ef] truncate">
              {creator.name}
            </span>
            <span className="block text-[12px] text-[#8c8d91] truncate">{creator.handle}</span>
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
            className="ml-auto shrink-0 text-[#5a5b60] group-hover:text-[#8c8d91] transition-colors duration-150"
          >
            <MoreHorizontal size={16} />
          </span>
        </span>

        <span className="mt-2.5">
          <span className="inline-flex items-center h-[21px] px-2 rounded-[6px] border border-[#24262a] bg-[#0c0d0f] text-[10.5px] text-[#c8c9ce]">
            {planBadgeLabel(plan)}
          </span>
        </span>

        <span className="mt-3 grid grid-cols-4 gap-2">
          <Kennzahl Zeichen={FolderOpen} wert={stats.collectionsCount} label="Collections" />
          <Kennzahl Zeichen={Layers} wert={stats.totalConcepts} label="Concepts" />
          <Kennzahl Zeichen={Send} wert={stats.delivered} label="Delivered" />
          <Kennzahl Zeichen={Clapperboard} wert={stats.activeSubmissions} label="In production" />
        </span>

        <span className="mt-auto flex items-center gap-2 min-w-0">
          {marken.map((t) => (
            <span
              key={t}
              className="shrink-0 h-[22px] px-2 rounded-[6px] border border-[#1e2023] bg-[#0b0c0e] text-[10.5px] text-[#a9aaae] flex items-center whitespace-nowrap"
            >
              {t}
            </span>
          ))}
          {mehr > 0 && (
            <span className="shrink-0 h-[22px] px-2 rounded-[6px] border border-[#1e2023] bg-[#0b0c0e] text-[10.5px] text-[#77787d] flex items-center">
              +{mehr}
            </span>
          )}
          {creator.updatedAt && (
            <span className="ml-auto shrink-0 text-[10.5px] text-[#6f7075] whitespace-nowrap">
              Updated {formatRelativeTime(creator.updatedAt).toLowerCase()}
            </span>
          )}
        </span>
      </span>

      <span
        aria-hidden
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-full border border-[#1e2023] bg-[#0b0c0e] flex items-center justify-center text-[#77787d] group-hover:text-[#D39448] group-hover:border-[#D39448]/35 transition-colors duration-150"
      >
        <ChevronRight size={14} />
      </span>
    </div>
  );
}
