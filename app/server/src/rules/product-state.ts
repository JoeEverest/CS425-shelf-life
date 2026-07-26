import { PERMISSIONS, type Permission } from "shared";

export function requiredProductEditPermission(published: boolean): Permission {
	return published
		? PERMISSIONS.PRODUCTS_EDIT_PUBLISHED
		: PERMISSIONS.PRODUCTS_CREATE_PUBLISH;
}

export function canEditProduct(
	published: boolean,
	permissions: readonly Permission[],
): boolean {
	return permissions.includes(requiredProductEditPermission(published));
}

export function canPublishProduct(published: boolean): boolean {
	return !published;
}
