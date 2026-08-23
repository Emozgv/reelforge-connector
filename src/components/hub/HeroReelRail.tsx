const RAIL_GRADIENTS = [
  "linear-gradient(160deg,#3a3140,#221d29)",
  "linear-gradient(160deg,#2f3a3a,#1b2222)",
  "linear-gradient(160deg,#3a3128,#241f1a)",
  "linear-gradient(160deg,#2c3140,#1a1d29)",
  "linear-gradient(160deg,#3a2c37,#231b23)",
  "linear-gradient(160deg,#2e3a34,#1a221f)",
];

function Column({
  offset,
  duration,
  reverse,
}: {
  offset: number;
  duration: number;
  reverse?: boolean;
}) {
  const tiles = [...RAIL_GRADIENTS.slice(offset), ...RAIL_GRADIENTS.slice(0, offset)];
  const loop = [...tiles, ...tiles];

  return (
    <div className="relative w-11 h-full overflow-hidden">
      <div
        className="rail-track absolute inset-x-0 top-0 flex flex-col gap-3"
        style={{
          animation: `rail-scroll ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {loop.map((g, i) => (
          <div
            key={i}
            className="w-11 aspect-[9/16] rounded-lg border border-white/[0.06] shrink-0"
            style={{ background: g }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Purely decorative, ambient motion flanking the hero — masked so it fades
 * both toward the outer screen edge and toward the center search column.
 * Never intercepts pointer events; hidden below the desktop breakpoint.
 */
export function HeroReelRails() {
  const maskStyle = {
    WebkitMaskImage:
      "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
    maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 85%)",
  };

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      <div
        className="absolute left-2 xl:left-6 2xl:left-10 top-0 bottom-0 flex items-center gap-3 xl:gap-4 opacity-[0.35]"
        style={maskStyle}
      >
        <Column offset={0} duration={36} />
        <Column offset={2} duration={44} reverse />
        <div className="hidden 2xl:block">
          <Column offset={3} duration={38} />
        </div>
      </div>
      <div
        className="absolute right-2 xl:right-6 2xl:right-10 top-0 bottom-0 flex items-center gap-3 xl:gap-4 opacity-[0.35]"
        style={maskStyle}
      >
        <div className="hidden 2xl:block">
          <Column offset={5} duration={42} reverse />
        </div>
        <Column offset={4} duration={40} reverse />
        <Column offset={1} duration={32} />
      </div>
    </div>
  );
}
