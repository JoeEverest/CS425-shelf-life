import { Hono } from "hono";
import {
	customerCreateSchema,
	customerPaymentCreateSchema,
	invoiceListQuerySchema,
	PERMISSIONS,
	resourceIdParamsSchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac, rbacAny } from "../middleware/rbac";
import { zodJson, zodParams, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { ReceivablesService } from "../services/receivables-service";

export function createCustomerRoutes(
	authService: AuthService,
	receivablesService: ReceivablesService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.CUSTOMERS_MANAGE),
			async (context) => context.json(await receivablesService.listCustomers()),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.CUSTOMERS_MANAGE),
			zodJson(customerCreateSchema),
			async (context) =>
				context.json(
					await receivablesService.createCustomer(context.req.valid("json")),
					201,
				),
		)
		.get(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.CUSTOMERS_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await receivablesService.getCustomer(context.req.valid("param").id),
				),
		);
}

export function createInvoiceRoutes(
	authService: AuthService,
	receivablesService: ReceivablesService,
) {
	const invoiceReadPermissions = [
		PERMISSIONS.CUSTOMERS_MANAGE,
		PERMISSIONS.INVOICES_RECORD_PAYMENT,
	] as const;

	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbacAny(invoiceReadPermissions),
			zodQuery(invoiceListQuerySchema),
			async (context) =>
				context.json(
					await receivablesService.listInvoices(context.req.valid("query")),
				),
		)
		.post(
			"/:id/payments",
			auth(authService),
			rbac(PERMISSIONS.INVOICES_RECORD_PAYMENT),
			zodParams(resourceIdParamsSchema),
			zodJson(customerPaymentCreateSchema),
			async (context) =>
				context.json(
					await receivablesService.recordPayment(
						context.req.valid("param").id,
						context.req.valid("json"),
						context.get("authUser").id,
					),
					201,
				),
		)
		.get(
			"/:id",
			auth(authService),
			rbacAny(invoiceReadPermissions),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await receivablesService.getInvoice(context.req.valid("param").id),
				),
		);
}
