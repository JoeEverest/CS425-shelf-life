import { products, stockMovements, stores } from "db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

export const qualifyingStockMovementInConfiguredWindow = and(
	eq(stockMovements.productId, products.id),
	inArray(stockMovements.reason, ["sale", "credit_sale"]),
	gte(
		stockMovements.occurredAt,
		sql`now() - ${stores.velocityWindowDays} * interval '1 day'`,
	),
);
