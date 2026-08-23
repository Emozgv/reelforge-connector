import { useEffect, useMemo, useRef, useState } from "react";

interface Star {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  peak: number;
  glow: boolean;
}

interface Dust {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  dx: number;
  distance: number;
  peak: number;
}

interface ShootingStar {
  id: number;
  top: number;
  left: number;
  rotate: number;
  dx: number;
  dy: number;
  duration: number;
  width: number;
}

let shootingStarIdSeq = 0;

// A single "falling" trajectory — angle and travel distance are randomized,
// then dx/dy are derived from them so the streak actually moves along the
// direction it's tilted in, rather than an approximated fixed ratio.
function makeShootingStar(overrides?: Partial<Pick<ShootingStar, "top" | "left" | "rotate">>): ShootingStar {
  const rotate = overrides?.rotate ?? 8 + Math.random() * 30;
  const travel = 170 + Math.random() * 230;
  const rad = (rotate * Math.PI) / 180;
  return {
    id: shootingStarIdSeq++,
    top: overrides?.top ?? 4 + Math.random() * 42,
    left: overrides?.left ?? Math.random() * 68,
    rotate,
    dx: travel * Math.cos(rad),
    dy: travel * Math.sin(rad),
    duration: 500 + Math.random() * 650,
    width: 85 + Math.random() * 55,
  };
}

// A calm, cinematic night-sky backdrop — used behind the app's hero moments
// (Dashboard, Login, Creativity Hub) so they read as one coherent product.
// Stars twinkle independently (randomized duration/delay so nothing pulses
// in unison). Shooting stars spawn on an irregular schedule — different
// timing, angle, speed and position every time, occasionally a close pair —
// rather than one fixed path repeating on a fixed interval. Everything is
// cheap CSS opacity/transform, paused with other ambient animations when the
// tab is hidden (see index.css).
export function StarfieldBackground({
  starCount = 70,
  dustCount = 0,
  shootingStars: shootingStarsEnabled = true,
}: {
  starCount?: number;
  dustCount?: number;
  shootingStars?: boolean;
}) {
  const [shootingStars, setShootingStars] = useState<ShootingStar[]>([]);
  const cleanupTimeouts = useRef<number[]>([]);

  useEffect(() => {
    if (!shootingStarsEnabled) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let nextSpawnTimeout: number;

    function addStar(star: ShootingStar) {
      setShootingStars((prev) => [...prev, star]);
      const removeAt = window.setTimeout(() => {
        setShootingStars((prev) => prev.filter((s) => s.id !== star.id));
      }, star.duration + 150);
      cleanupTimeouts.current.push(removeAt);
    }

    function spawn() {
      if (!document.hidden) {
        const first = makeShootingStar();
        addStar(first);

        // Roughly one time in five, a second star follows close behind on a
        // near-parallel path — never more than a loose pair, never a cluster.
        if (Math.random() < 0.2) {
          const followDelay = 180 + Math.random() * 420;
          const followTimeout = window.setTimeout(() => {
            addStar(
              makeShootingStar({
                top: first.top + (Math.random() * 10 - 5),
                left: first.left + (Math.random() * 8 - 4),
                rotate: first.rotate + (Math.random() * 8 - 4),
              })
            );
          }, followDelay);
          cleanupTimeouts.current.push(followTimeout);
        }
      }

      // Irregular gap between spawns — never a fixed cadence.
      nextSpawnTimeout = window.setTimeout(spawn, 7000 + Math.random() * 16000);
      cleanupTimeouts.current.push(nextSpawnTimeout);
    }

    nextSpawnTimeout = window.setTimeout(spawn, 3000 + Math.random() * 6000);
    cleanupTimeouts.current.push(nextSpawnTimeout);

    return () => {
      window.clearTimeout(nextSpawnTimeout);
      cleanupTimeouts.current.forEach((id) => window.clearTimeout(id));
      cleanupTimeouts.current = [];
    };
  }, [shootingStarsEnabled]);

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
        duration: 3 + Math.random() * 8,
        delay: Math.random() * 12,
        peak: isAccent ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4,
        glow: isAccent,
      };
    });
  }, [starCount]);

  const dust = useMemo<Dust[]>(() => {
    // Very faint, very slow — the one layer with continuous motion, so the
    // scene never fully sits still even between twinkles and shooting stars.
    return Array.from({ length: dustCount }).map(() => ({
      left: Math.random() * 100,
      top: 15 + Math.random() * 75,
      size: 0.8 + Math.random() * 0.8,
      duration: 42 + Math.random() * 30,
      delay: -Math.random() * 60,
      dx: Math.random() * 30 - 15,
      distance: 35 + Math.random() * 35,
      peak: 0.05 + Math.random() * 0.09,
    }));
  }, [dustCount]);

  return (
    <div className="starfield pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="starfield-drift">
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
      </div>
      {dust.map((d, i) => (
        <span
          key={i}
          className="dust-particle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--dust-peak" as any]: d.peak,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--dust-dx" as any]: `${d.dx}px`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--dust-distance" as any]: `${d.distance}px`,
          }}
        />
      ))}
      {shootingStars.map((s) => (
        <div
          key={s.id}
          className="shooting-star-instance"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.width,
            animationDuration: `${s.duration}ms`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--shoot-rotate" as any]: `${s.rotate}deg`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--shoot-dx" as any]: `${s.dx}px`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--shoot-dy" as any]: `${s.dy}px`,
          }}
        />
      ))}
    </div>
  );
}
