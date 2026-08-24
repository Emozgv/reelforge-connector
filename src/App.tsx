import { useState } from "react";
import { Sidebar, type Page } from "./components/layout/Sidebar";

const PAGE_LABELS: Record<Page, string> = {
  dashboard: "Dashboard",
  hub: "Creativity Hub",
  collections: "All collections",
  creators: "Creators",
  production: "Production",
  library: "Library",
  settings: "Settings",
};
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { CreativityHubPage } from "./components/hub/CreativityHubPage";
import { CollectionsPage } from "./components/collections/CollectionsPage";
import { CreatorsPage } from "./components/creators/CreatorsPage";
import { ProductionPage } from "./components/production/ProductionPage";
import { LibraryPage } from "./components/library/LibraryPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { LoginPage } from "./components/auth/LoginPage";
import { FullScreenLoader } from "./components/auth/FullScreenLoader";
import { NoWorkspaceAccess } from "./components/auth/NoWorkspaceAccess";
import { useCollectionsStore } from "./state/useCollectionsStore";
import { useCreatorsStore } from "./state/useCreatorsStore";
import { useAuthSession } from "./state/useAuthSession";
import { useWorkspace } from "./state/useWorkspace";
import { useActivityFeed } from "./state/useActivityFeed";
import { usePackage } from "./state/usePackage";
import { usePauseAnimationsWhenHidden } from "./state/usePauseAnimationsWhenHidden";

function App() {
  usePauseAnimationsWhenHidden();
  const [page, setPage] = useState<Page>("dashboard");
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
  const { workspace, loading: workspaceLoading, updateDisplayName } = useWorkspace(user?.id);
  const displayName = workspace?.displayName || user?.email;
  const creatorsStore = useCreatorsStore(workspace?.id);
  const collectionsStore = useCollectionsStore(workspace?.id);
  const activity = useActivityFeed(workspace?.id);
  const { package: workspacePackage } = usePackage(workspace?.id);

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
    return <NoWorkspaceAccess email={user.email} onSignOut={signOut} />;
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

        {page !== "hub" && (
          <div key={page} className="h-full animate-fade-in">
            {page === "dashboard" && (
              <DashboardPage
                userName={displayName}
                creators={creatorsStore.creators}
                collections={collectionsStore.collections}
                activity={activity}
                workspacePackage={workspacePackage}
                onOpenHub={() => setPage("hub")}
                onOpenCreator={navigateToCreator}
                onOpenCollection={navigateToCollection}
                onOpenCollections={() => setPage("collections")}
                onOpenCreators={() => setPage("creators")}
                onOpenSettings={() => setPage("settings")}
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
                onOpenCollection={navigateToCollection}
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
            {page === "settings" && (
              <SettingsPage
                userEmail={user.email}
                workspaceName={workspace.name}
                role={workspace.role}
                displayName={workspace.displayName}
                onUpdateDisplayName={updateDisplayName}
                onSignOut={signOut}
                workspacePackage={workspacePackage}
                collections={collectionsStore.collections}
                creators={creatorsStore.creators}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
