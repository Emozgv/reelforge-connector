import { Search, ShieldCheck, ChevronRight, ImageOff } from "lucide-react";
import type { AdminWorkspaceRow, ThumbnailBackfillResult } from "../../state/useAdminDashboard";

const STATUS_STYLE: Record<AdminWorkspaceRow["status"], string> = {
  active: "text-emerald-300/85 bg-emerald-400/10",
  suspended: "text-amber-300/85 bg-amber-400/10",
  removed: "text-rose-300/85 bg-rose-400/10",
};

export function AdminClientList({
  workspaces,
  loading,
  error,
  search,
  onSearchChange,
  onOpen,
  backfillRunning,
  backfillResult,
  backfillError,
  onRunThumbnailBackfill,
}: {
  workspaces: AdminWorkspaceRow[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onOpen: (workspaceId: string) => void;
  backfillRunning: boolean;
  backfillResult: ThumbnailBackfillResult | null;
  backfillError: string | null;
  onRunThumbnailBackfill: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-8 pt-6 pb-8">
        <span className="text-[10.5px] tracking-[0.14em] uppercase text-[#D39448]/75 font-medium flex items-center gap-1.5">
          <ShieldCheck size={11} />
          ReelForge Admin
        </span>
        <h1 className="mt-1 text-[20px] font-serif font-medium text-neutral-50">All clients</h1>
        <p className="mt-1 text-[12.5px] text-neutral-500 max-w-lg">
          Every agency workspace on ReelForge — search, open one, and manage its plan, credits, and status.
        </p>

        <div className="mt-5 relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by workspace or owner email…"
            className="w-full h-10 pl-9 pr-3 rounded-lg surface-field text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
          />
        </div>

        {error && <p className="mt-3 text-[12px] text-rose-400">{error}</p>}

        <div className="mt-5 rounded-xl surface-panel px-4 py-3.5 flex items-center gap-3">
          <ImageOff size={15} className="text-neutral-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-neutral-200">Backfill saved thumbnails</p>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              Mirrors existing concepts' source thumbnails into permanent storage where the source is still
              reachable. Safe to run more than once — already-mirrored concepts are skipped.
            </p>
            {backfillResult && (
              <p className="mt-1 text-[11.5px] text-neutral-400">
                Scanned {backfillResult.scanned}, recovered {backfillResult.succeeded}, couldn't recover{" "}
                {backfillResult.failed} (source already gone).
                {backfillResult.more && " More remain — run again to continue."}
              </p>
            )}
            {backfillError && <p className="mt-1 text-[11.5px] text-rose-400">{backfillError}</p>}
          </div>
          <button
            onClick={onRunThumbnailBackfill}
            disabled={backfillRunning}
            className="shrink-0 h-8 px-3 rounded-lg surface-field text-[12px] text-neutral-200 hover:text-neutral-50 transition-colors duration-150 disabled:opacity-60"
          >
            {backfillRunning ? "Running…" : "Run backfill"}
          </button>
        </div>

        <div className="mt-5 rounded-xl surface-panel overflow-hidden">
          <div className="grid grid-cols-[1.6fr_1.4fr_0.8fr_0.6fr_0.6fr_0.9fr_0.7fr] gap-3 px-4 py-2.5 text-[10.5px] tracking-wide uppercase text-neutral-600 border-b border-white/[0.06]">
            <span>Client / Agency</span>
            <span>Owner</span>
            <span>Plan</span>
            <span>Team</span>
            <span>Creators</span>
            <span>Usage</span>
            <span>Status</span>
          </div>

          {loading && <p className="px-4 py-8 text-center text-[12.5px] text-neutral-500">Loading…</p>}

          {!loading && workspaces.length === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] text-neutral-500">No clients match that search.</p>
          )}

          {!loading &&
            workspaces.map((w) => (
              <button
                key={w.workspaceId}
                onClick={() => onOpen(w.workspaceId)}
                className="w-full grid grid-cols-[1.6fr_1.4fr_0.8fr_0.6fr_0.6fr_0.9fr_0.7fr] gap-3 px-4 py-3 items-center text-left hover:bg-white/[0.03] transition-colors duration-150 border-b border-white/[0.04] last:border-0"
              >
                <span className="text-[13px] text-neutral-100 truncate flex items-center gap-1.5">
                  {w.workspaceName}
                  <ChevronRight size={12} className="text-neutral-700 shrink-0" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] text-neutral-300 truncate">{w.ownerName ?? "—"}</span>
                  <span className="block text-[10.5px] text-neutral-600 truncate">{w.ownerEmail ?? "—"}</span>
                </span>
                <span className="text-[12px] text-neutral-300 truncate">{w.planName ?? "—"}</span>
                <span className="text-[12px] text-neutral-400 tabular-nums">{w.memberCount}</span>
                <span className="text-[12px] text-neutral-400 tabular-nums">{w.creatorCount}</span>
                <span className="text-[12px] text-neutral-400 tabular-nums">
                  {w.reelsUsed}
                  {w.monthlyAllowance != null && <span className="text-neutral-600"> / {w.monthlyAllowance}</span>}
                </span>
                <span
                  className={["shrink-0 w-fit text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] capitalize", STATUS_STYLE[w.status]].join(
                    " "
                  )}
                >
                  {w.status}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
