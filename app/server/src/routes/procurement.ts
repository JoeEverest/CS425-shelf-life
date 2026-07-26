import { Hono } from "hono";
import {
	archivedFilterSchema,
	PERMISSIONS,
	purchaseOrderCreateSchema,
	purchaseOrderStatusQuerySchema,
	resourceIdParamsSchema,
	supplierCreateSchema,
	supplierUpdateSchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodJson, zodParams, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { ProcurementService } from "../services/procurement-service";

export function createSupplierRoutes(
	authService: AuthService,
	procurementService: ProcurementService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.SUPPLIERS_MANAGE),
			zodQuery(archivedFilterSchema),
			async (context) =>
				context.json(
					await procurementService.listSuppliers(
						context.req.valid("query").archived,
					),
				),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.SUPPLIERS_MANAGE),
			zodJson(supplierCreateSchema),
			async (context) =>
				context.json(
					await procurementService.createSupplier(context.req.valid("json")),
					201,
				),
		)
		.patch(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.SUPPLIERS_MANAGE),
			zodParams(resourceIdParamsSchema),
			zodJson(supplierUpdateSchema),
			async (context) =>
				context.json(
					await procurementService.updateSupplier(
						context.req.valid("param").id,
						context.req.valid("json"),
					),
				),
		)
		.post(
			"/:id/archive",
			auth(authService),
			rbac(PERMISSIONS.SUPPLIERS_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await procurementService.archiveSupplier(
						context.req.valid("param").id,
					),
				),
		);
}

export function createPurchaseOrderRoutes(
	authService: AuthService,
	procurementService: ProcurementService,
) {
	return new Hono<AppEnv>()
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.PURCHASE_ORDERS_CREATE),
			zodJson(purchaseOrderCreateSchema),
			async (context) =>
				context.json(
					await procurementService.createPurchaseOrder(
						context.req.valid("json"),
						context.get("authUser").id,
					),
					201,
				),
		)
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.PURCHASE_ORDERS_VIEW),
			zodQuery(purchaseOrderStatusQuerySchema),
			async (context) =>
				context.json(
					await procurementService.listPurchaseOrders(
						context.req.valid("query").status,
					),
				),
		)
		.get(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.PURCHASE_ORDERS_VIEW),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await procurementService.getPurchaseOrder(
						context.req.valid("param").id,
					),
				),
		);
}
