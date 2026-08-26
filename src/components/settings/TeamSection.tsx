import { useState } from "react";
import { Users as UsersIcon, X, Loader2, Mail } from "lucide-react";
import { useTeamMembers, MAX_ADDITIONAL_MEMBERS } from "../../state/useTeamMembers";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type WorkspaceRole } from "../../lib/permissions";

const ROLE_BADGE_STYLE: Record<WorkspaceRole, string> = {
  owner: "text-[#D39448] bg-[#D39448]/10",
  manager: "text-sky-300/85 bg-sky-400/10",
  va: "text-neutral-400 bg-white/[0.05]",
};

// Owner+Manager only — SettingsPage never renders this for a VA at all (see
// canManageTeam). Every mutation here is a thin wrapper over RPCs/an edge
// function that independently re-checks the caller's role and the owner
// protections server-side — this component enforces nothing on its own.
export function TeamSection({
  workspaceId,
  currentUserId,
  callerRole,
}: {
  workspaceId: string;
  currentUserId: string;
  callerRole: string | undefined;
}) {
  const {
    members,
    invites,
    loading,
    error,
    atMax,
    additionalCount,
    inviteMember,
    changeRole,
    removeMember,
    cancelInvite,
    updatePlanPermission,
  } = useTeamMembers(workspaceId);

  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Extract<WorkspaceRole, "manager" | "va">>("va");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    setInviteError(null);
    const { error: err } = await inviteMember(email, inviteRole);
    setInviteSubmitting(false);
    if (err) {
      setInviteError(err);
      return;
    }
    setInviteEmail("");
    setInviteRole("va");
    setInviting(false);
  }

  async function handleRoleChange(membershipId: string, role: Extract<WorkspaceRole, "manager" | "va">) {
    setBusyId(membershipId);
    await changeRole(membershipId, role);
    setBusyId(null);
  }

  async function handleRemove(membershipId: string) {
    setBusyId(membershipId);
    await removeMember(membershipId);
    setBusyId(null);
  }

  async function handleCancelInvite(inviteId: string) {
    setBusyId(inviteId);
    await cancelInvite(inviteId);
    setBusyId(null);
  }

  async function handlePlanPermissionToggle(membershipId: string, next: boolean) {
    setBusyId(membershipId);
    await updatePlanPermission(membershipId, next);
    setBusyId(null);
  }

  return (
    <div className="rounded-xl surface-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <UsersIcon size={15} className="text-[#D39448]" />
          <span className="text-[13px] font-medium text-neutral-200">Team</span>
        </div>
        <span className="text-[11px] text-neutral-500">
          {additionalCount} / {MAX_ADDITIONAL_MEMBERS} invited
        </span>
      </div>

      {error && <p className="mt-2 text-[11.5px] text-rose-400">{error}</p>}

      {!loading && (
        <div className="mt-3 space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="rounded-lg surface-field px-3 py-2">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#D39448]/20 flex items-center justify-center text-[10px] font-medium text-[#D39448] shrink-0">
                  {(m.displayName || m.email || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] text-neutral-200 truncate">{m.displayName || m.email || "Member"}</p>
                  {m.displayName && m.email && <p className="text-[10.5px] text-neutral-600 truncate">{m.email}</p>}
                </div>

                {m.role === "owner" ? (
                  <span className={["shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]", ROLE_BADGE_STYLE.owner].join(" ")}>
                    Owner
                  </span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => void handleRoleChange(m.id, e.target.value as "manager" | "va")}
                      className={[
                        "shrink-0 text-[10.5px] font-medium rounded-[6px] px-1.5 py-1 outline-none border-0 disabled:opacity-50",
                        ROLE_BADGE_STYLE[m.role],
                      ].join(" ")}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r} className="bg-[#0b0f14] text-neutral-100">
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleRemove(m.id)}
                      disabled={busyId === m.id || m.userId === currentUserId}
                      title={m.userId === currentUserId ? "Sign out to leave the workspace" : "Remove"}
                      className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 hover:text-rose-400 hover:bg-rose-400/[0.08] transition-colors duration-150 disabled:opacity-30 disabled:hover:text-neutral-600 disabled:hover:bg-transparent"
                    >
                      {busyId === m.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    </button>
                  </>
                )}
              </div>

              {/* Off by default for every Manager — only the Owner can grant
                  this, and only ever sees the toggle for their own review;
                  a Manager viewing the team list never sees or controls it
                  for anyone, including themselves. */}
              {m.role === "manager" && callerRole === "owner" && (
                <label className="mt-2 flex items-center gap-2 pl-9 text-[11px] text-neutral-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={m.canChangePlan}
                    disabled={busyId === m.id}
                    onChange={(e) => void handlePlanPermissionToggle(m.id, e.target.checked)}
                    className="accent-[#D39448]"
                  />
                  Can change plan
                </label>
              )}
            </div>
          ))}

          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2.5 rounded-lg surface-field px-3 py-2 opacity-70">
              <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                <Mail size={11} className="text-neutral-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-neutral-300 truncate">{inv.email}</p>
                <p className="text-[10.5px] text-neutral-600">Invite pending</p>
              </div>
              <span className={["shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]", ROLE_BADGE_STYLE[inv.role]].join(" ")}>
                {ROLE_LABEL[inv.role]}
              </span>
              <button
                onClick={() => void handleCancelInvite(inv.id)}
                disabled={busyId === inv.id}
                title="Cancel invite"
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 hover:text-rose-400 hover:bg-rose-400/[0.08] transition-colors duration-150 disabled:opacity-30"
              >
                {busyId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        {!inviting ? (
          <button
            onClick={() => setInviting(true)}
            disabled={atMax}
            className="text-[12px] font-medium text-[#D39448] hover:brightness-110 transition-[filter] disabled:opacity-40 disabled:cursor-default"
          >
            {atMax ? `Up to ${MAX_ADDITIONAL_MEMBERS} team members` : "+ Invite team member"}
          </button>
        ) : (
          <form onSubmit={handleInvite} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="email"
                autoFocus
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 h-9 px-3 rounded-lg surface-field text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "manager" | "va")}
                className="h-9 px-2 rounded-lg surface-field text-[12.5px] text-neutral-200 outline-none"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r} className="bg-[#0b0f14] text-neutral-100">
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            {inviteError && <p className="text-[11px] text-rose-400">{inviteError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={inviteSubmitting || !inviteEmail.trim()}
                className="h-8 px-3 rounded-lg text-[12px] font-medium bg-[#D39448] text-[#020508] disabled:opacity-40 hover:brightness-110 transition-[filter] flex items-center gap-1.5"
              >
                {inviteSubmitting && <Loader2 size={12} className="animate-spin" />}
                {inviteSubmitting ? "Sending…" : "Send invite"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviting(false);
                  setInviteError(null);
                  setInviteEmail("");
                }}
                className="h-8 px-3 rounded-lg text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
