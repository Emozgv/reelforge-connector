export type WorkspaceRole = "owner" | "manager" | "va";

// Deliberately just these questions — the product calls for three
// predefined roles, not a general permission framework. Every one of these
// is also enforced at the database level (RLS / SECURITY DEFINER RPCs) —
// this helper only controls what the UI shows, never the real access.

// Team *management* (invite, change a role, remove a member, cancel an
// invite) is Owner-only — a Manager can see the team (see canViewTeam
// below) but never act on it, confirmed as a real gap live: a Manager
// could otherwise change their own role. Owner and Manager can see
// Billing; a VA gets the full day-to-day workspace (Research, Research
// Accounts, Collections, Creators, Production, Library) but neither of
// those two things.
export function canManageTeam(role: string | undefined): boolean {
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
