import { useMemo } from "react";

interface Star {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  peak: number;
  glow: boolean;
}

// A calm, cinematic night-sky backdrop — used behind the app's hero moments
// (Dashboard, Login, Creativity Hub) so they read as one coherent product.
// Stars twinkle independently (randomized duration/delay so nothing pulses
// in unison) and a single shooting star drifts through on a slow, quiet
// cycle. Star count is intentionally modest and animations are pure CSS
// opacity/transform — cheap to composite, paused with every other ambient
// animation when the tab is hidden (see index.css).
export function StarfieldBackground({ starCount = 70 }: { starCount?: number }) {
  const shooting = useMemo(
    () => ({
      top: 6 + Math.random() * 30,
      rotate: 14 + Math.random() * 16,
      travel: 260 + Math.random() * 160,
    }),
    []
  );

  const stars = useMemo<Star[]>(() => {
    // Deterministic per mount, not per render — a plain seeded-ish spread is
    // enough here, there's no need for a video-grid-style seeded RNG. Most
    // stars stay tiny and faint (fine sky texture); a small minority are
    // slightly larger "hero" points with a soft bloom, for a little depth.
    return Array.from({ length: starCount }).map(() => {
      const isAccent = Math.random() < 0.12;
      return {
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: isAccent ? 1.6 + Math.random() * 0.9 : 0.6 + Math.random() * 0.7,
        duration: 3.5 + Math.random() * 5.5,
        delay: Math.random() * 9,
        peak: isAccent ? 0.75 + Math.random() * 0.25 : 0.35 + Math.random() * 0.35,
        glow: isAccent,
      };
    });
  }, [starCount]);

  return (
    <div className="starfield pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="star-twinkle absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
            boxShadow: s.glow ? "0 0 4px 1px rgba(255,244,222,0.5)" : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--star-peak" as any]: s.peak,
          }}
        />
      ))}
      <div
        className="shooting-star"
        style={{
          top: `${shooting.top}%`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--shoot-rotate" as any]: `${shooting.rotate}deg`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--shoot-travel" as any]: `${shooting.travel}px`,
        }}
      />
    </div>
  );
}
