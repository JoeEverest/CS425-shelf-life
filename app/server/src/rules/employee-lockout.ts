import type { Role } from "shared";

export function canDeactivateEmployee(
	actorId: string,
	employeeId: string,
): boolean {
	return actorId !== employeeId;
}

/**
 * Only an admin may grant or revoke the admin role. A non-admin actor (e.g. a
 * manager, who also holds employees.manage) may edit other fields and roles,
 * but must not add admin to anyone (escalation) or strip admin from anyone
 * (which could brick admin-only store.configure).
 */
export function actorMayChangeAdminMembership(actor: {
	roles: readonly Role[];
}): boolean {
	return actor.roles.includes("admin");
}

export function rolesChangeAdminMembership(
	currentRoles: readonly Role[],
	replacementRoles: readonly Role[],
): boolean {
	return currentRoles.includes("admin") !== replacementRoles.includes("admin");
}
