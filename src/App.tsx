import { useState } from "react";
import { Sidebar, type Page } from "./components/layout/Sidebar";
import { CreativityHubPage } from "./components/hub/CreativityHubPage";
import { CollectionsPage } from "./components/collections/CollectionsPage";
import { useCollectionsStore } from "./state/useCollectionsStore";

function App() {
  const [page, setPage] = useState<Page>("hub");
  const collectionsStore = useCollectionsStore();

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

      <Sidebar page={page} onNavigate={setPage} />
      <div className="relative z-10 flex-1 min-w-0 h-full">
        {page === "hub" && <CreativityHubPage collectionsStore={collectionsStore} />}
        {page === "collections" && <CollectionsPage collectionsStore={collectionsStore} />}
      </div>
    </div>
  );
}

export default App;
