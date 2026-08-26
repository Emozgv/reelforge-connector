import { useState } from "react";
import { Sidebar, type Page } from "./components/layout/Sidebar";

const PAGE_LABELS: Record<Page, string> = {
  dashboard: "Dashboard",
  hub: "Creativity Hub",
  research: "Research Accounts",
  collections: "All collections",
  creators: "Creators",
  production: "Production",
  library: "Library",
  billing: "Billing",
  settings: "Settings",
  admin: "Admin Dashboard",
};
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { CreativityHubPage } from "./components/hub/CreativityHubPage";
import { CollectionsPage } from "./components/collections/CollectionsPage";
import { CreatorsPage } from "./components/creators/CreatorsPage";
import { ProductionPage } from "./components/production/ProductionPage";
import { LibraryPage } from "./components/library/LibraryPage";
import { BillingPage } from "./components/billing/BillingPage";
import { ResearchAccountsPage } from "./components/research/ResearchAccountsPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { AdminDashboardPage } from "./components/admin/AdminDashboardPage";
import { LoginPage } from "./components/auth/LoginPage";
import { FullScreenLoader } from "./components/auth/FullScreenLoader";
import { NoWorkspaceAccess } from "./components/auth/NoWorkspaceAccess";
import { SetPasswordPage } from "./components/auth/SetPasswordPage";
import { supabase } from "./lib/supabase";
import { canChangePlan } from "./lib/permissions";
import { useCollectionsStore } from "./state/useCollectionsStore";
import { useCreatorsStore } from "./state/useCreatorsStore";
import { useAuthSession } from "./state/useAuthSession";
import { useWorkspace } from "./state/useWorkspace";
import { useAdminAccess } from "./state/useAdminAccess";
import { useActivityFeed } from "./state/useActivityFeed";
import { useCreatorPackages } from "./state/useCreatorPackages";
import { useResearchAccounts } from "./state/useResearchAccounts";
import { usePauseAnimationsWhenHidden } from "./state/usePauseAnimationsWhenHidden";

function App() {
  usePauseAnimationsWhenHidden();
  // Stripe Checkout redirects back to `#billing?stripe=success|cancelled` —
  // land the returning user on Billing instead of the default Dashboard so
  // the result of what they just did is immediately visible.
  const [page, setPage] = useState<Page>(window.location.hash.startsWith("#billing") ? "billing" : "dashboard");
  const [openCollectionId, setOpenCollectionId] = useState<string | null>(null);
  const [openCreatorId, setOpenCreatorId] = useState<string | null>(null);
  // Which page a Collection was opened from, so "Back" returns you there
  // (e.g. opened from Library -> Back goes to Library, not the flat list).
  const [collectionOrigin, setCollectionOrigin] = useState<Page>("collections");

  function navigateToCollection(collectionId: string) {
    setCollectionOrigin(page);
    setOpenCollectionId(collectionId);
    setPage("collections");
  }

  // The one true "leave the collection workspace" action — respects wherever
  // it was opened from. Internal navigation within Collections (switching
  // tabs, opening a different row) uses setOpenCollectionId directly instead,
  // which intentionally leaves the origin untouched.
  function closeCollectionWorkspace() {
    setOpenCollectionId(null);
    if (collectionOrigin !== "collections") {
      const origin = collectionOrigin;
      setCollectionOrigin("collections");
      setPage(origin);
    }
  }

  function navigateToCreator(creatorId: string) {
    setOpenCreatorId(creatorId);
    setPage("creators");
  }

  const { user, loading: authLoading, signIn, signOut } = useAuthSession();
  const {
    workspace,
    loading: workspaceLoading,
    justJoined,
    dismissJustJoined,
    inviteCancelled,
    suspendedStatus,
    updateDisplayName,
  } = useWorkspace(user?.id);
  const { isAdmin: isPlatformAdmin } = useAdminAccess(user?.id);
  const displayName = workspace?.displayName || user?.email;
  const creatorsStore = useCreatorsStore(workspace?.id);
  const collectionsStore = useCollectionsStore(workspace?.id);
  const activity = useActivityFeed(workspace?.id);
  const { packages: creatorPackages } = useCreatorPackages(workspace?.id);
  const researchAccountsStore = useResearchAccounts(workspace?.id);

  if (authLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <LoginPage onSignIn={(email, password) => signIn(email, password).then((e) => e?.message ?? null)} />;
  }

  if (workspaceLoading) {
    return <FullScreenLoader />;
  }

  if (!workspace) {
    // A platform admin with no client workspace of their own still gets the
    // full Admin Dashboard — this account exists to manage other clients,
    // not to belong to one itself.
    if (isPlatformAdmin) {
      return (
        <div className="relative flex h-screen w-screen bg-[#020508] text-neutral-200 font-sans overflow-hidden">
          <div className="grain-overlay" />
          <Sidebar
            page="admin"
            onNavigate={() => {}}
            userEmail={user.email}
            isPlatformAdmin
            onSignOut={signOut}
            activity={{ items: [], loading: false }}
            onOpenCollection={() => {}}
          />
          <div className="relative z-10 flex-1 min-w-0 h-full">
            <AdminDashboardPage />
          </div>
        </div>
      );
    }
    return (
      <NoWorkspaceAccess
        email={user.email}
        cancelled={inviteCancelled}
        suspendedStatus={suspendedStatus}
        onSignOut={signOut}
      />
    );
  }

  if (justJoined) {
    return (
      <SetPasswordPage
        workspaceName={workspace.name}
        onSetPassword={async (password) => {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) return error.message;
          dismissJustJoined();
          return null;
        }}
      />
    );
  }

  if (creatorsStore.loading || collectionsStore.loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="relative flex h-screen w-screen bg-[#020508] text-neutral-200 font-sans overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(900px 460px at 82% -10%, rgba(201,154,95,0.06), transparent 62%)",
        }}
      />
      <div className="grain-overlay" />

      <Sidebar
        page={page}
        onNavigate={setPage}
        userEmail={user.email}
        displayName={displayName}
        workspaceName={workspace.name}
        role={workspace.role}
        isPlatformAdmin={isPlatformAdmin}
        onSignOut={signOut}
        activity={activity}
        onOpenCollection={navigateToCollection}
      />
      <div className="relative z-10 flex-1 min-w-0 h-full">
        {/* Kept mounted (just hidden) rather than conditionally rendered like
            every other page below — the Hub's whole point is that stepping
            away to Dashboard/Collections/etc and coming back should feel
            uninterrupted: same keyword/profile, same loaded batch, same
            scroll position, same open reel modal. Unmounting it on every
            navigation would throw all of that away and force a refetch. */}
        <div className={page === "hub" ? "h-full animate-fade-in" : "hidden"}>
          <CreativityHubPage
            creators={creatorsStore.creators}
            creatorsError={creatorsStore.error}
            collectionsStore={collectionsStore}
            onOpenCollection={navigateToCollection}
            active={page === "hub"}
          />
        </div>

        {/* Same reasoning as the Hub above: Research Accounts drives a real,
            persistent live Instagram/TikTok session (see
            useLiveResearchSession) that has nothing to do with which Client
            OS section is on screen. Unmounting this on every navigation was
            tearing that live session down and rebuilding a brand-new one on
            return — the actual cause of "returns to reel #1" and the
            occasional stale "Connector needs to start" right after a tab
            switch (Connector was fine; the whole session had just been
            thrown away and recreated). Kept mounted so stepping away to
            Collections and back resumes exactly where the VA left off. */}
        <div className={page === "research" ? "h-full animate-fade-in" : "hidden"}>
          <ResearchAccountsPage
            creators={creatorsStore.creators}
            creatorsError={creatorsStore.error}
            collectionsStore={collectionsStore}
            researchAccountsStore={researchAccountsStore}
            userId={user.id}
            workspaceId={workspace?.id}
            active={page === "research"}
            onOpenCollection={navigateToCollection}
          />
        </div>

        {page !== "hub" && page !== "research" && (
          <div key={page} className="h-full animate-fade-in">
            {page === "admin" && isPlatformAdmin && <AdminDashboardPage />}
            {page === "dashboard" && (
              <DashboardPage
                userName={displayName}
                creators={creatorsStore.creators}
                collections={collectionsStore.collections}
                activity={activity}
                creatorPackages={creatorPackages}
                onOpenHub={() => setPage("hub")}
                onOpenCreator={navigateToCreator}
                onOpenCollection={navigateToCollection}
                onOpenCollections={() => setPage("collections")}
                onOpenCreators={() => setPage("creators")}
                onOpenBilling={() => setPage("billing")}
              />
            )}
            {page === "collections" && (
              <CollectionsPage
                creators={creatorsStore.creators}
                collectionsStore={collectionsStore}
                openCollectionId={openCollectionId}
                onOpenCollectionIdChange={setOpenCollectionId}
                onCloseCollection={closeCollectionWorkspace}
                backLabel={PAGE_LABELS[collectionOrigin]}
              />
            )}
            {page === "creators" && (
              <CreatorsPage
                creatorsStore={creatorsStore}
                collectionsStore={collectionsStore}
                creatorPackages={creatorPackages}
                onOpenCollection={navigateToCollection}
                onOpenBilling={() => setPage("billing")}
                openCreatorId={openCreatorId}
                onOpenCreatorIdChange={setOpenCreatorId}
              />
            )}
            {page === "production" && (
              <ProductionPage
                creators={creatorsStore.creators}
                collections={collectionsStore.collections}
                onOpenCollection={navigateToCollection}
              />
            )}
            {page === "library" && (
              <LibraryPage
                creators={creatorsStore.creators}
                collections={collectionsStore.collections}
                onRequestRegeneration={collectionsStore.requestRegeneration}
                onToggleFavorite={collectionsStore.toggleFavoriteSubmission}
                onApprove={collectionsStore.approveSubmission}
                onUploadFinishedVideo={collectionsStore.uploadFinishedVideo}
              />
            )}
            {page === "billing" && (
              <BillingPage
                creators={creatorsStore.creators}
                workspaceId={workspace.id}
                canChangePlan={canChangePlan(workspace.role, workspace.canChangePlan)}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                userId={user.id}
                userEmail={user.email}
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                role={workspace.role}
                displayName={workspace.displayName}
                onUpdateDisplayName={updateDisplayName}
                onSignOut={signOut}
                onOpenBilling={() => setPage("billing")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
