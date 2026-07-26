import { Hono } from "hono";
import {
	PERMISSIONS,
	resourceIdParamsSchema,
	storeUpdateSchema,
	userCreateSchema,
	userUpdateSchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodJson, zodParams } from "../middleware/validate";
import type { AdministrationService } from "../services/administration-service";
import type { AuthService } from "../services/auth-service";

export function createUserRoutes(
	authService: AuthService,
	administrationService: AdministrationService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.EMPLOYEES_MANAGE),
			async (context) => context.json(await administrationService.listUsers()),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.EMPLOYEES_MANAGE),
			zodJson(userCreateSchema),
			async (context) =>
				context.json(
					await administrationService.createUser(context.req.valid("json")),
					201,
				),
		)
		.patch(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.EMPLOYEES_MANAGE),
			zodParams(resourceIdParamsSchema),
			zodJson(userUpdateSchema),
			async (context) =>
				context.json(
					await administrationService.updateUser(
						context.req.valid("param").id,
						context.req.valid("json"),
						context.get("authUser"),
					),
				),
		)
		.post(
			"/:id/deactivate",
			auth(authService),
			rbac(PERMISSIONS.EMPLOYEES_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await administrationService.deactivateUser(
						context.req.valid("param").id,
						context.get("authUser").id,
					),
				),
		)
		.post(
			"/:id/reactivate",
			auth(authService),
			rbac(PERMISSIONS.EMPLOYEES_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await administrationService.reactivateUser(
						context.req.valid("param").id,
					),
				),
		);
}

export function createStoreRoutes(
	authService: AuthService,
	administrationService: AdministrationService,
) {
	return new Hono<AppEnv>()
		.get("/", auth(authService), async (context) =>
			context.json(await administrationService.getStore()),
		)
		.patch(
			"/",
			auth(authService),
			rbac(PERMISSIONS.STORE_CONFIGURE),
			zodJson(storeUpdateSchema),
			async (context) =>
				context.json(
					await administrationService.updateStore(context.req.valid("json")),
				),
		);
}
