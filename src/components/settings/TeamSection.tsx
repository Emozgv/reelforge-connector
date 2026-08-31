import { useState } from "react";
import { Users as UsersIcon, X, Loader2, Mail } from "lucide-react";
import { useTeamMembers, MAX_ADDITIONAL_MEMBERS, type TeamMember } from "../../state/useTeamMembers";
import { ASSIGNABLE_ROLES, ROLE_LABEL, canChangeTeamRoles, canManageTeam, type WorkspaceRole } from "../../lib/permissions";

const ROLE_BADGE_STYLE: Record<WorkspaceRole, string> = {
  owner: "text-[#D39448] bg-[#D39448]/10",
  manager: "text-sky-300/85 bg-sky-400/10",
  va: "text-neutral-400 bg-white/[0.05]",
};

const GROUP_LABEL: Record<WorkspaceRole, string> = {
  owner: "Agency Owner",
  manager: "Manager",
  va: "VA",
};

// Visible to every role — viewing the team isn't sensitive. Owner and
// Manager both get invite/remove/cancel-invite; only changing a role is
// Owner-only (a real bug: a Manager could otherwise self-demote). A VA
// sees a fully read-only list, no controls at all. Every mutation here is
// a thin wrapper over RPCs/an edge function that independently re-checks
// the caller's role server-side — this component enforces nothing on its
// own, it just doesn't render controls the caller couldn't use anyway.
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
  const canManage = canManageTeam(callerRole);
  const canChangeRoles = canChangeTeamRoles(callerRole);

  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Extract<WorkspaceRole, "manager" | "va">>("va");
  const [inviteSydAccess, setInviteSydAccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    setInviteError(null);
    const { error: err } = await inviteMember(email, inviteRole, inviteSydAccess);
    setInviteSubmitting(false);
    if (err) {
      setInviteError(err);
      return;
    }
    setInviteEmail("");
    setInviteRole("va");
    setInviteSydAccess(false);
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

  function MemberRow({ m }: { m: TeamMember }) {
    return (
      <div className="rounded-lg surface-field px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-[#D39448]/20 flex items-center justify-center text-[10px] font-medium text-[#D39448] shrink-0">
            {(m.displayName || m.email || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-neutral-200 truncate">{m.displayName || m.email || "Member"}</p>
            {m.displayName && m.email && <p className="text-[10.5px] text-neutral-600 truncate">{m.email}</p>}
          </div>

          {m.role === "owner" || !canChangeRoles ? (
            <span className={["shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px]", ROLE_BADGE_STYLE[m.role]].join(" ")}>
              {ROLE_LABEL[m.role]}
            </span>
          ) : (
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
          )}

          {m.role !== "owner" && canManage && (
            <button
              onClick={() => void handleRemove(m.id)}
              disabled={busyId === m.id || m.userId === currentUserId}
              title={m.userId === currentUserId ? "Sign out to leave the workspace" : "Remove"}
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 hover:text-rose-400 hover:bg-rose-400/[0.08] transition-colors duration-150 disabled:opacity-30 disabled:hover:text-neutral-600 disabled:hover:bg-transparent"
            >
              {busyId === m.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            </button>
          )}
        </div>

        {/* Off by default for every Manager — only the Owner can grant
            this, and only the Owner ever sees the toggle; nobody else
            sees or controls it for anyone, including themselves. */}
        {m.role === "manager" && canChangeRoles && (
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
    );
  }

  const groupedMembers: { role: WorkspaceRole; rows: TeamMember[] }[] = (["owner", "manager", "va"] as const)
    .map((role) => ({ role, rows: members.filter((m) => m.role === role) }))
    .filter((g) => g.rows.length > 0);

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
        <div className="mt-3 space-y-3">
          {groupedMembers.map((group) => (
            <div key={group.role}>
              <p className="mb-1.5 text-[10.5px] tracking-wide uppercase text-neutral-500">
                {GROUP_LABEL[group.role]}
                {group.role === "owner" ? ":" : ""}
              </p>
              <div className="space-y-1.5">
                {group.rows.map((m) => (
                  <MemberRow key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}

          {invites.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10.5px] tracking-wide uppercase text-neutral-500">Pending</p>
              <div className="space-y-1.5">
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
                    {inv.sydAccess && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] text-[#D39448] bg-[#D39448]/10">
                        + Sydney
                      </span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => void handleCancelInvite(inv.id)}
                        disabled={busyId === inv.id}
                        title="Cancel invite"
                        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-neutral-600 hover:text-rose-400 hover:bg-rose-400/[0.08] transition-colors duration-150 disabled:opacity-30"
                      >
                        {busyId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {canManage && (
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
              {/* Optional bridge -- grants a client_os.syd_members row on
                  acceptance alongside the normal Client OS membership. Sydney
                  permissions themselves stay managed inside Sydney Studio
                  Internal; this only decides whether the person has Sydney
                  access at all. Pure Sydney production VAs still get invited
                  exclusively from Sydney Studio Internal, never from here. */}
              <label className="flex items-center gap-2 text-[11.5px] text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={inviteSydAccess}
                  onChange={(e) => setInviteSydAccess(e.target.checked)}
                  className="accent-[#D39448]"
                />
                Sydney access
              </label>
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
      )}
    </div>
  );
}
