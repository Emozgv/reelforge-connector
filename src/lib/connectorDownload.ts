// ReelForge Connector installer downloads — hosted as plain public files in
// the reelforge-connector-releases Supabase Storage bucket (same pattern
// the ReelForge Internal app's own updater already uses for its releases),
// under fixed, version-independent paths so this URL never needs to change
// just because the app's internal version number does. Uploading a new
// build means overwriting the object at the same path, not touching this
// file. No signing/notarization is wired up yet — these are the plain
// installers `tauri build` already produces.
const RELEASES_BASE = "https://vbnilccvnygeedkdfbvd.supabase.co/storage/v1/object/public/reelforge-connector-releases/latest";

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
