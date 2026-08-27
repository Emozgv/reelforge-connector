import { useState } from "react";
import { useAdminDashboard } from "../../state/useAdminDashboard";
import { AdminClientList } from "./AdminClientList";
import { AdminClientDetail } from "./AdminClientDetail";

// The entire cross-tenant surface lives under this one page — gated
// entirely server-side (every admin_* RPC independently re-checks
// is_platform_admin()), this component just decides list vs. detail.
export function AdminDashboardPage() {
  const {
    workspaces,
    loading,
    error,
    search,
    setSearch,
    backfillRunning,
    backfillResult,
    backfillError,
    runThumbnailBackfill,
  } = useAdminDashboard();
  const [openWorkspaceId, setOpenWorkspaceId] = useState<string | null>(null);

  if (openWorkspaceId) {
    return <AdminClientDetail workspaceId={openWorkspaceId} onBack={() => setOpenWorkspaceId(null)} />;
  }

  return (
    <AdminClientList
      workspaces={workspaces}
      loading={loading}
      error={error}
      search={search}
      onSearchChange={setSearch}
      onOpen={setOpenWorkspaceId}
      backfillRunning={backfillRunning}
      backfillResult={backfillResult}
      backfillError={backfillError}
      onRunThumbnailBackfill={runThumbnailBackfill}
    />
  );
}
