// NUR ZUM ANSCHAUEN (11.10.2026). Rendert die Billing-Seite ohne Anmeldung,
// damit ich sie gegen Emres Screenshot vergleichen kann. Fliegt danach raus.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BillingPage } from "./components/billing/BillingPage";
import type { Creator } from "./types";

const creators: Creator[] = [
  { id: "1", name: "Ava Marlowe", handle: "@avamarlowe", avatarColor: "#c9a227" },
  { id: "2", name: "Carolina", handle: "@carolina", avatarColor: "#7a9ec9" },
  { id: "3", name: "Riley Quinn", handle: "@rileyquinn", avatarColor: "#b07ac9" },
  { id: "4", name: "Jordan Blake", handle: "@jordanblake", avatarColor: "#7ac9a0" },
  { id: "5", name: "Sasha Reyes", handle: "@sashareyes", avatarColor: "#c97a7a" },
] as unknown as Creator[];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="h-screen bg-[#020508] text-neutral-200">
      <BillingPage creators={creators} workspaceId={undefined} canChangePlan />
    </div>
  </StrictMode>
);
