// avatarColor is a purely presentational value — it isn't persisted in
// client_os.creators, so it's derived deterministically from the row's id
// instead (same creator always renders the same color, no extra column needed).
const PALETTE = ["#e0a6ff", "#8bd1ff", "#ffb787", "#9dffb0", "#ff9dc4", "#ffe08a", "#a6b8ff", "#7fe8d0"];

export function avatarColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
