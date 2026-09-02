import { useEffect, useState } from "react";
import { Send, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";

type QueueRow = {
  id: string;
  status: string;
  note: string | null;
  assigned_va_email: string | null;
  delivery_url: string | null;
  collection_name: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  concept_count: number;
};

type EventRow = { id: string; submission_id: string; event_type: string; message: string; created_at: string };

const STATUS_STYLES: Record<string, string> = {
  Requested: "bg-white/[0.06] text-neutral-300",
  Accepted: "bg-blue-500/10 text-blue-300",
  "In Progress": "bg-[#D39448]/10 text-[#D39448]",
  "Delivery Ready": "bg-emerald-500/10 text-emerald-300",
  Finished: "bg-emerald-500/15 text-emerald-300",
  Cancelled: "bg-red-500/10 text-red-300",
};

// Gated by App.tsx to any Sydney member (hasSydAccess). Read-only: queue +
// history, visible to every Sydney member, Owner or not (the backing RPCs
// -- list_syd_queue/list_syd_events -- already only require
// is_syd_member()). Deliberately no invite control here anymore -- pure
// Sydney production VAs are invited exclusively from Sydney Studio
// Internal, and that flow already sends a real branded email, which this
// page's old "Invite SYD VA" box never did (it only ever showed a raw
// code to copy/share manually) -- confusing and redundant next to the
// real thing, so it was removed. No production work happens on this page
// either way, that's Sydney Studio Internal's job. isOwner is kept only
// for the subtitle copy.
export function SydOwnerPage({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [q, e] = await Promise.all([
      supabase.schema("client_os").rpc("list_syd_queue"),
      supabase.schema("client_os").rpc("list_syd_events"),
    ]);
    if (q.error) setError(q.error.message);
    setRows((q.data as QueueRow[]) ?? []);
    setEvents(((e.data as EventRow[]) ?? []).slice(0, 20));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="p-6 xl:p-8 max-w-3xl mx-auto">
      <h1 className="text-[18px] font-serif font-medium text-neutral-50 mb-1">Sydney Studio</h1>
      <p className="text-[12.5px] text-neutral-500 mb-6">
        {isOwner
          ? "Private production requests — visible only to you. Not part of normal ReelForge activity."
          : "Private production requests — status and history. Not part of normal ReelForge activity."}
      </p>

      {error && <p className="text-[12px] text-red-300 mb-4">{error}</p>}

      <div className="rounded-lg surface-panel p-4 mb-6">
        <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5 mb-3">
          <Send size={11} />
          SYD requests
        </span>
        {!rows && <p className="text-[12px] text-neutral-600">Loading…</p>}
        {rows?.length === 0 && <p className="text-[12px] text-neutral-600">No SYD requests yet.</p>}
        <div className="space-y-2">
          {rows?.map((r) => (
            <div key={r.id} className="rounded-md surface-field p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-neutral-200">{r.collection_name}</span>
                <span className={["text-[10px] font-medium px-1.5 py-[2px] rounded", STATUS_STYLES[r.status] ?? ""].join(" ")}>
                  SYD · {r.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                {r.creator_name ?? "Unknown creator"} · {r.concept_count} concepts
                {r.assigned_va_email ? ` · ${r.assigned_va_email}` : ""}
              </p>
              {r.delivery_url && (
                <a
                  href={r.delivery_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-[#D39448] hover:brightness-110"
                >
                  Delivery link
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg surface-panel p-4">
        <span className="text-[10.5px] tracking-wide uppercase text-neutral-500 flex items-center gap-1.5 mb-3">
          <Clock size={11} />
          History
        </span>
        {events.length === 0 && <p className="text-[12px] text-neutral-600">No activity yet.</p>}
        <div className="space-y-1.5">
          {events.map((e) => (
            <p key={e.id} className="text-[11.5px] text-neutral-400">
              {e.message} <span className="text-neutral-600">— {new Date(e.created_at).toLocaleString()}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
