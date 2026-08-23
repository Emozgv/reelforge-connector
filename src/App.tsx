import { useState } from "react";
import { Sidebar, type Page } from "./components/layout/Sidebar";
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
import { usePauseAnimationsWhenHidden } from "./state/usePauseAnimationsWhenHidden";

function App() {
  usePauseAnimationsWhenHidden();
  const [page, setPage] = useState<Page>("dashboard");
  const [openCollectionId, setOpenCollectionId] = useState<string | null>(null);
  const [openCreatorId, setOpenCreatorId] = useState<string | null>(null);

  function navigateToCollection(collectionId: string) {
    setOpenCollectionId(collectionId);
    setPage("collections");
  }

  function navigateToCreator(creatorId: string) {
    setOpenCreatorId(creatorId);
    setPage("creators");
  }

  const { user, loading: authLoading, signIn, signOut } = useAuthSession();
  const { workspace, loading: workspaceLoading } = useWorkspace(user?.id);
  const creatorsStore = useCreatorsStore(workspace?.id);
  const collectionsStore = useCollectionsStore(workspace?.id);
  const activity = useActivityFeed(workspace?.id);

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
    <div className="relative flex h-screen w-screen bg-[#0b0b0d] text-neutral-200 font-sans overflow-hidden">
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
        workspaceName={workspace.name}
        onSignOut={signOut}
        activity={activity}
        onOpenCollection={navigateToCollection}
      />
      <div key={page} className="relative z-10 flex-1 min-w-0 h-full animate-fade-in">
        {page === "dashboard" && (
          <DashboardPage
            userName={user.email}
            creators={creatorsStore.creators}
            collections={collectionsStore.collections}
            activity={activity}
            onOpenHub={() => setPage("hub")}
            onOpenCreator={navigateToCreator}
            onOpenCollection={navigateToCollection}
          />
        )}
        {page === "hub" && (
          <CreativityHubPage
            creators={creatorsStore.creators}
            creatorsError={creatorsStore.error}
            collectionsStore={collectionsStore}
            onOpenCollection={navigateToCollection}
          />
        )}
        {page === "collections" && (
          <CollectionsPage
            creators={creatorsStore.creators}
            collectionsStore={collectionsStore}
            openCollectionId={openCollectionId}
            onOpenCollectionIdChange={setOpenCollectionId}
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
            onOpenCollection={navigateToCollection}
            onRequestRegeneration={collectionsStore.requestRegeneration}
          />
        )}
        {page === "settings" && (
          <SettingsPage
            userEmail={user.email}
            workspaceName={workspace.name}
            role={workspace.role}
            onSignOut={signOut}
          />
        )}
      </div>
    </div>
  );
}

export default App;
