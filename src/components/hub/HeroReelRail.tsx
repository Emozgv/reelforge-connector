const RAIL_GRADIENTS = [
  "linear-gradient(160deg,#3a3140,#221d29)",
  "linear-gradient(160deg,#2f3a3a,#1b2222)",
  "linear-gradient(160deg,#3a3128,#241f1a)",
  "linear-gradient(160deg,#2c3140,#1a1d29)",
  "linear-gradient(160deg,#3a2c37,#231b23)",
  "linear-gradient(160deg,#2e3a34,#1a221f)",
];

// Fixed, purely decorative set of real reel thumbnail images — not tied to
// Discovery, Collections, or any other live data. Just here so the hero
// rails visually read as "real reels" instead of abstract gradient tiles.
// Mirrored into our own Storage (hero-rail-images bucket) instead of
// linking provider CDN URLs directly, since those expire (TikTok in hours,
// Instagram in a couple of days) — these public Storage URLs don't.
const RAIL_IMAGES = [
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-0.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-1.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-2.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-3.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-4.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-5.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-6.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-7.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-8.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-9.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-10.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-11.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-12.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-13.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-14.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-15.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-16.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-17.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-18.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-19.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-20.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-21.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-22.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-23.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-24.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-25.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-26.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-27.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-28.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-29.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-30.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-32.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-33.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-34.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-35.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-36.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-37.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-38.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-39.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-40.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-41.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-42.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-43.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-44.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-45.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-46.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-47.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-48.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-49.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-50.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-51.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-52.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-53.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-54.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-55.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-56.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-57.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-58.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-59.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-60.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-61.jpg",
  "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/hero-rail-images/rail-62.jpg",
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
        {loop.map((g, i) => {
          const src = RAIL_IMAGES[(offset + i) % RAIL_IMAGES.length];
          return (
            <div
              key={i}
              className="w-11 aspect-[9/16] rounded-lg border border-white/[0.06] shrink-0 overflow-hidden"
              style={{ background: g }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          );
        })}
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
