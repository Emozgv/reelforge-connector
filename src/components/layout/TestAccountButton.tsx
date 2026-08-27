import { useEffect, useState } from "react";
import { FlaskConical, X, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Throwaway workspace members for previewing the live app as a non-owner
// would see it, without the real email-invite flow (which needs a real
// inbox and a click-through). Entirely self-contained — doesn't touch the
// real Team Members list/state in Settings at all, just its own small
// popover backed by the manage-test-account edge function.
interface TestAccountRow {
  id: string;
  email: string | null;
}

export function TestAccountButton({ workspaceId, canManage }: { workspaceId?: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<TestAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!workspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .schema("client_os")
      .from("workspace_members")
      .select("id, email")
      .eq("workspace_id", workspaceId)
      .eq("display_name", "Test Account")
      .order("created_at", { ascending: false });
    setAccounts((data ?? []) as TestAccountRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (open) void load();
  }, [open, workspaceId]);

  async function createAccount() {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("manage-test-account", {
      body: { action: "create", workspaceId, email: email.trim(), password },
    });
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Couldn't create the test account.");
      setBusy(false);
      return;
    }
    setEmail("");
    setPassword("");
    setBusy(false);
    void load();
  }

  async function deleteAccount(memberId: string) {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("manage-test-account", {
      body: { action: "delete", workspaceId, memberId },
    });
    if (invokeError || data?.error) {
      setError(data?.error ?? invokeError?.message ?? "Couldn't delete that test account.");
      setBusy(false);
      return;
    }
    setBusy(false);
    void load();
  }

  if (!canManage || !workspaceId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Test accounts"
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05] transition-colors duration-150"
      >
        <FlaskConical size={15} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-9 z-30 w-72 rounded-xl surface-panel-strong p-3 animate-fade-in"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-neutral-200">Test accounts</span>
            <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-200">
              <X size={13} />
            </button>
          </div>
          <p className="text-[10.5px] text-neutral-500 mb-2.5">
            Throwaway logins to preview this workspace as a non-owner. Skips email — log in immediately.
          </p>

          {loading && <p className="text-[11px] text-neutral-500 py-1">Loading…</p>}
          {!loading && accounts.length > 0 && (
            <div className="mb-2.5 space-y-1">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
                  <span className="text-[11.5px] text-neutral-300 truncate">{a.email}</span>
                  <button
                    onClick={() => void deleteAccount(a.id)}
                    disabled={busy}
                    title="Delete this test account"
                    className="shrink-0 text-neutral-500 hover:text-rose-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={12.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
              className="w-full h-8 px-2.5 rounded-lg surface-field text-[12px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password (8+ characters)"
              className="w-full h-8 px-2.5 rounded-lg surface-field text-[12px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
            />
            {error && <p className="text-[10.5px] text-rose-400">{error}</p>}
            <button
              onClick={() => void createAccount()}
              disabled={busy || !email.trim() || password.length < 8}
              className="w-full h-8 rounded-lg bg-gradient-to-br from-[#D39448] to-[#A97942] text-[12px] font-medium text-[#1a1408] disabled:opacity-50 transition-opacity"
            >
              {busy ? "Creating…" : "Create test account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
