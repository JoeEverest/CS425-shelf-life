import { Hono } from "hono";
import {
	expenseCreateSchema,
	expenseListQuerySchema,
	expenseUpdateSchema,
	PERMISSIONS,
	periodQuerySchema,
	resourceIdParamsSchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac, rbacAny } from "../middleware/rbac";
import { zodJson, zodParams, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { FinanceService } from "../services/finance-service";

export function createExpenseRoutes(
	authService: AuthService,
	financeService: FinanceService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbacAny([PERMISSIONS.EXPENSES_MANAGE, PERMISSIONS.REPORTS_VIEW]),
			zodQuery(expenseListQuerySchema),
			async (context) =>
				context.json(
					await financeService.listExpenses(context.req.valid("query")),
				),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.EXPENSES_MANAGE),
			zodJson(expenseCreateSchema),
			async (context) =>
				context.json(
					await financeService.createExpense(
						context.req.valid("json"),
						context.get("authUser").id,
					),
					201,
				),
		)
		.patch(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.EXPENSES_MANAGE),
			zodParams(resourceIdParamsSchema),
			zodJson(expenseUpdateSchema),
			async (context) =>
				context.json(
					await financeService.updateExpense(
						context.req.valid("param").id,
						context.req.valid("json"),
					),
				),
		)
		.delete(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.EXPENSES_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await financeService.deleteExpense(context.req.valid("param").id),
				),
		);
}

export function createReportRoutes(
	authService: AuthService,
	financeService: FinanceService,
) {
	return new Hono<AppEnv>().get(
		"/financial",
		auth(authService),
		rbac(PERMISSIONS.REPORTS_VIEW),
		zodQuery(periodQuerySchema),
		async (context) =>
			context.json(
				await financeService.financialReport(context.req.valid("query")),
			),
	);
}
