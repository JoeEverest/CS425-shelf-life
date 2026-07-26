import { Hono } from "hono";
import { dashboardQuerySchema, PERMISSIONS } from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodQuery } from "../middleware/validate";
import type { AnalyticsService } from "../services/analytics-service";
import type { AuthService } from "../services/auth-service";

export function createAnalyticsRoutes(
	authService: AuthService,
	analyticsService: AnalyticsService,
) {
	return new Hono<AppEnv>().get(
		"/dashboard",
		auth(authService),
		rbac(PERMISSIONS.ANALYTICS_VIEW),
		zodQuery(dashboardQuerySchema),
		async (context) =>
			context.json(
				await analyticsService.dashboard(context.req.valid("query")),
			),
	);
}
