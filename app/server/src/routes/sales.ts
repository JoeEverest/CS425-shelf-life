import { Hono } from "hono";
import {
	PERMISSIONS,
	resourceIdParamsSchema,
	saleCreateSchema,
	salesListQuerySchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodJson, zodParams, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { SalesService } from "../services/sales-service";

export function createSalesRoutes(
	authService: AuthService,
	salesService: SalesService,
) {
	return new Hono<AppEnv>()
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.SALES_RECORD),
			zodJson(saleCreateSchema),
			async (context) =>
				context.json(
					await salesService.createSale(
						context.req.valid("json"),
						context.get("authUser").id,
					),
				),
		)
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.SALES_RECORD),
			zodQuery(salesListQuerySchema),
			async (context) =>
				context.json(await salesService.listSales(context.req.valid("query"))),
		)
		.get(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.SALES_RECORD),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(await salesService.getSale(context.req.valid("param").id)),
		);
}
