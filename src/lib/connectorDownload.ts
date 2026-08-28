// ReelForge Connector installer downloads — served directly from the
// rolling "connector-latest" GitHub Release that connector-build.yml
// publishes to on every push to main, under fixed, version-independent
// asset names so this URL never needs to change just because the app's
// internal version number does. This is the same release/latest.json the
// in-app updater already polls, so the download button and auto-update can
// never drift out of sync with each other again.
const RELEASES_BASE = "https://github.com/Emozgv/reelforge-connector/releases/download/connector-latest";

export type ConnectorOS = "macos" | "windows";

export const CONNECTOR_DOWNLOAD_URL: Record<ConnectorOS, string> = {
  macos: `${RELEASES_BASE}/ReelForge-Connector-macOS.dmg`,
  windows: `${RELEASES_BASE}/ReelForge-Connector-Windows-Setup.exe`,
};

// Best-effort — the modern userAgentData API is the more reliable signal
// where it exists (not spoofed by "desktop site" toggles the way
// navigator.platform can be), falling back to platform/userAgent string
// sniffing everywhere else. Returns null when neither signal is confident,
// which is the caller's cue to ask rather than guess.
export function detectConnectorOS(): ConnectorOS | null {
  const uaDataPlatform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const platform = uaDataPlatform || navigator.platform || "";
  const ua = navigator.userAgent || "";

  if (/mac/i.test(platform) || /Macintosh/i.test(ua)) return "macos";
  if (/win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  return null;
}

export function startConnectorDownload(os: ConnectorOS) {
  window.open(CONNECTOR_DOWNLOAD_URL[os], "_blank", "noopener,noreferrer");
}
