import { Hono } from "hono";
import { PERMISSIONS, priceUpdateSchema, resourceIdParamsSchema } from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac } from "../middleware/rbac";
import { zodJson, zodParams } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { PricingService } from "../services/pricing-service";

export function createPricingRoutes(
	authService: AuthService,
	pricingService: PricingService,
) {
	return new Hono<AppEnv>()
		.patch(
			"/:id/price",
			auth(authService),
			rbac(PERMISSIONS.PRODUCTS_SET_PRICE),
			zodParams(resourceIdParamsSchema),
			zodJson(priceUpdateSchema),
			async (context) =>
				context.json(
					await pricingService.setPrice(
						context.req.valid("param").id,
						context.req.valid("json"),
						context.get("authUser").id,
					),
				),
		)
		.get(
			"/:id/price-history",
			auth(authService),
			rbac(PERMISSIONS.PRODUCTS_SET_PRICE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await pricingService.listPriceHistory(context.req.valid("param").id),
				),
		);
}
