import type { MiddlewareHandler } from "hono";
import type { Permission } from "shared";
import type { AppEnv } from "../auth-context";
import { hasPermission } from "../rules/authorization";
import { forbidden } from "./errors";

export function rbac(permission: Permission): MiddlewareHandler<AppEnv> {
	return async (context, next) => {
		if (!hasPermission(context.get("authUser").roles, permission)) {
			return forbidden(context);
		}

		await next();
	};
}

export function rbacAny(
	permissions: readonly Permission[],
): MiddlewareHandler<AppEnv> {
	return async (context, next) => {
		if (
			!permissions.some((permission) =>
				hasPermission(context.get("authUser").roles, permission),
			)
		) {
			return forbidden(context);
		}

		await next();
	};
}
