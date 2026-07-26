import {
	PERMISSIONS,
	type Permission,
	ROLE_PERMISSIONS,
	type Role,
} from "shared";

export type { Permission, Role };
export { PERMISSIONS };

export function can(roles: readonly Role[], permission: Permission): boolean {
	return roles.some((role) =>
		(ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission),
	);
}

export const ROLE_LABELS: Record<Role, string> = {
	admin: "Admin",
	manager: "Manager",
	sales_clerk: "Sales clerk",
	inventory_clerk: "Inventory clerk",
	accountant: "Accountant",
};
