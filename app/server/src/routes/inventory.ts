import { Hono } from "hono";
import {
	archivedFilterSchema,
	PERMISSIONS,
	stockAdjustmentSchema,
	stockMovementsQuerySchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodJson, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { InventoryService } from "../services/inventory-service";

export function createInventoryRoutes(
	authService: AuthService,
	inventoryService: InventoryService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.STOCK_VIEW),
			zodQuery(archivedFilterSchema),
			async (context) =>
				context.json(
					await inventoryService.listStock(context.req.valid("query").archived),
				),
		)
		.post(
			"/adjustments",
			auth(authService),
			rbac(PERMISSIONS.INVENTORY_ADJUST),
			zodJson(stockAdjustmentSchema),
			async (context) =>
				context.json(
					await inventoryService.adjustStock(
						context.req.valid("json"),
						context.get("authUser").id,
					),
					201,
				),
		)
		.get(
			"/movements",
			auth(authService),
			rbac(PERMISSIONS.STOCK_VIEW),
			zodQuery(stockMovementsQuerySchema),
			async (context) =>
				context.json(
					await inventoryService.listMovements(
						context.req.valid("query").productId,
					),
				),
		);
}
