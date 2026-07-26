import { type Permission, ROLE_PERMISSIONS, type Role } from "shared";

export function hasPermission(
	roles: readonly Role[],
	permission: Permission,
): boolean {
	return roles.some((role) => {
		const permissions: readonly Permission[] = ROLE_PERMISSIONS[role];
		return permissions.includes(permission);
	});
}
