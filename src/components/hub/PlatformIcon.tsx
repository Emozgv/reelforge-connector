import type { Platform } from "../../types";

function InstagramGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="white" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="white" />
    </svg>
  );
}

function TikTokGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15.5 3c.4 2.1 1.8 3.5 4 3.8v3c-1.5 0-2.9-.4-4-1.2v6.2c0 3.4-2.4 5.7-5.6 5.7-3.1 0-5.6-2.4-5.6-5.6 0-3.1 2.4-5.6 5.5-5.6.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 2 2.6V3h2.8Z"
        fill="white"
      />
    </svg>
  );
}

export function PlatformIcon({ platform, size = 13 }: { platform: Platform; size?: number }) {
  return platform === "instagram" ? <InstagramGlyph size={size} /> : <TikTokGlyph size={size} />;
}
