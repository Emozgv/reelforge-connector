export type WorkspaceRole = "owner" | "manager" | "va";

// Deliberately just these questions — the product calls for three
// predefined roles, not a general permission framework. Every one of these
// is also enforced at the database level (RLS / SECURITY DEFINER RPCs) —
// this helper only controls what the UI shows, never the real access.

// Owner and Manager can both invite/remove a member/cancel an invite. Only
// a VA can't — it can't manage the team at all, day-to-day or otherwise.
export function canManageTeam(role: string | undefined): boolean {
  return role === "owner" || role === "manager";
}

// Changing a member's role specifically is narrower than the above and
// Owner-only — confirmed as a real gap live: a Manager could otherwise
// change their own role (self-demote). Everything else about team
// management (invite/remove/cancel-invite) Owner and Manager both keep.
export function canChangeTeamRoles(role: string | undefined): boolean {
  return role === "owner";
}

// Viewing who's on the team (names, emails, roles, pending invites) isn't
// sensitive the way changing it is — every role gets this, including VA.
export function canViewTeam(_role: string | undefined): boolean {
  return true;
}

export function canViewBilling(role: string | undefined): boolean {
  return role === "owner" || role === "manager";
}

// Off by default for every Manager — the Owner has to explicitly grant it
// per member (see update_member_plan_permission), never something a
// Manager can turn on for themselves.
export function canChangePlan(role: string | undefined, canChangePlanFlag: boolean | undefined): boolean {
  return role === "owner" || (role === "manager" && !!canChangePlanFlag);
}

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  manager: "Manager",
  va: "VA",
};

export const ASSIGNABLE_ROLES: Extract<WorkspaceRole, "manager" | "va">[] = ["manager", "va"];
