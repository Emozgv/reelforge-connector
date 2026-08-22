import { useEffect, useRef, useState } from "react";
import { Sparkle } from "lucide-react";

// Small product-personality detail — funny, motivating, or a light creative
// fact. Purely decorative copy, cycled slowly with a soft crossfade.
//
// This pool is a plain string array today, but `pickNext` only needs *some*
// array to draw from — a future AI-generated microcopy source can slot in by
// swapping the `pool` prop for a periodically-refreshed array (fetched in the
// background, well outside the 5–10s rotation cadence) without touching the
// rotation/no-repeat logic below.
export const MICROCOPY_POOL: string[] = [
  "Fun fact: most scroll-stopping hooks land in the first 0.6 seconds.",
  "Somewhere out there, the perfect POV shot is just waiting to be found.",
  "Confidence reads faster than perfection on camera.",
  "Behind every viral Reel is someone who almost didn't post it.",
  "A great concept is just a good idea that showed up on time.",
  "Take a breath — the algorithm can wait a second.",
  "Golden hour forgives everything.",
  "The best captions get written in the shower, apparently.",
  "Somewhere, a mirror selfie is quietly outperforming a studio shoot.",
  "Great hooks ask a question the viewer didn't know they had.",
  "Storytime reels work best when they start mid-thought.",
  "You don't need better lighting. You need a better first line.",
  "The scroll doesn't lie — but it does reward confidence.",
  "A slightly awkward laugh on camera beats a perfect smile.",
  "Every niche has a golden-hour version of itself.",
  "Talking-head reels live or die in the first three words.",
  "Nobody has ever regretted saving one more concept.",
  "The gym mirror is the most honest camera in the world.",
  "Good editing is invisible. Good hooks are unmissable.",
  "Somewhere a creator is about to nail a take on the first try.",
  "Cute beats polished, most days.",
  "If it feels slightly too personal, it's probably working.",
  "Reels with a POV twist tend to age well.",
  "The best concepts are stolen from real conversations.",
  "A pause before the punchline is doing more work than you think.",
  "Outdoor light is free and undefeated.",
  "You can't schedule inspiration, but you can save it for later.",
  "Some of the best Reels start as a note titled 'random idea'.",
  "Research today, wins next week.",
  "A slow morning routine reel has quietly carried entire accounts.",
  "The right tag on the wrong day is still the wrong day.",
  "Every collection is just future you, saying thank you.",
];

// Avoid immediate repeats by keeping a short rolling history of recently shown
// items and excluding them from the next pick (falls back to full pool once
// the pool is smaller than the history window).
function pickNext(pool: string[], recent: string[]): string {
  const candidates = pool.filter((line) => !recent.includes(line));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)];
}

const HISTORY_WINDOW = 6;
const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 10000;

export function RotatingMicrocopy({ pool = MICROCOPY_POOL }: { pool?: string[] }) {
  const [current, setCurrent] = useState(() => pool[Math.floor(Math.random() * pool.length)]);
  const recentRef = useRef<string[]>([current]);

  useEffect(() => {
    let timeoutId: number;

    function scheduleNext() {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
      timeoutId = window.setTimeout(() => {
        const next = pickNext(pool, recentRef.current);
        recentRef.current = [next, ...recentRef.current].slice(0, HISTORY_WINDOW);
        setCurrent(next);
        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return () => window.clearTimeout(timeoutId);
  }, [pool]);

  return (
    <div className="mt-3 h-4 flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
      <Sparkle size={10} className="text-[#c99a5f]/70 shrink-0" />
      <span key={current} className="animate-fade-in">
        {current}
      </span>
    </div>
  );
}
