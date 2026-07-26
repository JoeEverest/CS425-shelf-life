import { randomUUID } from "node:crypto";
import type { Database } from "db";
import { products, stockLevels, stockMovements, stores } from "db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { StockAdjustmentInput } from "shared";
import { qualifyingStockMovementInConfiguredWindow } from "./stock-velocity-query";

export class InsufficientStockRepoError extends Error {}
export class ProductStockNotFoundRepoError extends Error {}

export class InventoryRepo {
	constructor(private readonly database: Database) {}

	async listStock(includeArchived: boolean) {
		const baseQuery = this.database
			.select({
				productId: products.id,
				sku: products.sku,
				name: products.name,
				bulkUnitName: products.bulkUnitName,
				unitsPerBulk: products.unitsPerBulk,
				saleUnitName: products.saleUnitName,
				qtyUnits: stockLevels.qtyUnits,
				archived: products.archived,
			})
			.from(products)
			.innerJoin(stockLevels, eq(stockLevels.productId, products.id));

		if (includeArchived) {
			return baseQuery.orderBy(products.name);
		}

		return baseQuery.where(eq(products.archived, false)).orderBy(products.name);
	}

	listStockAlertInputs() {
		return this.database
			.select({
				productId: products.id,
				sku: products.sku,
				name: products.name,
				qtyUnits: stockLevels.qtyUnits,
				saleUnitName: products.saleUnitName,
				unitsSoldInWindow: sql<number>`coalesce(sum(-${stockMovements.deltaUnits}), 0)::double precision`,
				movementCount: sql<number>`count(${stockMovements.id})::int`,
				windowDays: stores.velocityWindowDays,
				coverDays: stores.lowStockCoverDays,
			})
			.from(products)
			.innerJoin(stockLevels, eq(stockLevels.productId, products.id))
			.innerJoin(stores, sql`true`)
			.leftJoin(stockMovements, qualifyingStockMovementInConfiguredWindow)
			.where(eq(products.archived, false))
			.groupBy(products.id, stockLevels.productId, stores.id);
	}

	async adjustStock(input: StockAdjustmentInput, actorId: string) {
		const adjustmentId = randomUUID();

		return this.database.transaction(async (transaction) => {
			const condition =
				input.deltaUnits < 0
					? and(
							eq(stockLevels.productId, input.productId),
							gte(stockLevels.qtyUnits, Math.abs(input.deltaUnits)),
						)
					: eq(stockLevels.productId, input.productId);

			const [level] = await transaction
				.update(stockLevels)
				.set({
					qtyUnits: sql`${stockLevels.qtyUnits} + ${input.deltaUnits}`,
				})
				.where(condition)
				.returning({ qtyUnits: stockLevels.qtyUnits });

			if (!level) {
				const [existingLevel] = await transaction
					.select({ productId: stockLevels.productId })
					.from(stockLevels)
					.where(eq(stockLevels.productId, input.productId));

				if (!existingLevel) {
					throw new ProductStockNotFoundRepoError();
				}
				throw new InsufficientStockRepoError();
			}

			const [movement] = await transaction
				.insert(stockMovements)
				.values({
					productId: input.productId,
					deltaUnits: input.deltaUnits,
					reason: "adjustment",
					refTable: "adjustments",
					refId: adjustmentId,
					actorId,
					note: input.note,
				})
				.returning({
					id: stockMovements.id,
					productId: stockMovements.productId,
					deltaUnits: stockMovements.deltaUnits,
					reason: stockMovements.reason,
					refTable: stockMovements.refTable,
					refId: stockMovements.refId,
					actorId: stockMovements.actorId,
					note: stockMovements.note,
					occurredAt: stockMovements.occurredAt,
					createdAt: stockMovements.createdAt,
				});

			if (!movement) {
				throw new Error("Failed to record stock movement.");
			}

			return { ...movement, qtyUnits: level.qtyUnits };
		});
	}

	async listMovements(productId: string) {
		return this.database
			.select({
				id: stockMovements.id,
				productId: stockMovements.productId,
				deltaUnits: stockMovements.deltaUnits,
				reason: stockMovements.reason,
				refTable: stockMovements.refTable,
				refId: stockMovements.refId,
				actorId: stockMovements.actorId,
				note: stockMovements.note,
				occurredAt: stockMovements.occurredAt,
				createdAt: stockMovements.createdAt,
			})
			.from(stockMovements)
			.where(eq(stockMovements.productId, productId))
			.orderBy(desc(stockMovements.occurredAt), desc(stockMovements.createdAt))
			.limit(100);
	}
}
