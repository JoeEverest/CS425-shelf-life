import type { Database } from "db";
import { priceChanges, products } from "db/schema";
import { desc, eq } from "drizzle-orm";

export class PriceProductNotFoundRepoError extends Error {}
export class PriceProductArchivedRepoError extends Error {}

const priceChangeSelection = {
	id: priceChanges.id,
	productId: priceChanges.productId,
	oldPrice: priceChanges.oldPrice,
	newPrice: priceChanges.newPrice,
	changedBy: priceChanges.changedBy,
	createdAt: priceChanges.createdAt,
};

export class PricingRepo {
	constructor(private readonly database: Database) {}

	async setPrice(productId: string, newPrice: string, actorId: string) {
		return this.database.transaction(async (transaction) => {
			const [product] = await transaction
				.select({ price: products.price, archived: products.archived })
				.from(products)
				.where(eq(products.id, productId))
				.for("update");

			if (!product) {
				throw new PriceProductNotFoundRepoError();
			}
			if (product.archived) {
				throw new PriceProductArchivedRepoError();
			}

			await transaction
				.update(products)
				.set({ price: newPrice })
				.where(eq(products.id, productId));

			const [change] = await transaction
				.insert(priceChanges)
				.values({
					productId,
					oldPrice: product.price,
					newPrice,
					changedBy: actorId,
				})
				.returning(priceChangeSelection);

			if (!change) {
				throw new Error("Failed to record price change.");
			}

			return change;
		});
	}

	async productExists(productId: string): Promise<boolean> {
		const [product] = await this.database
			.select({ id: products.id })
			.from(products)
			.where(eq(products.id, productId));
		return Boolean(product);
	}

	listPriceHistory(productId: string) {
		return this.database
			.select(priceChangeSelection)
			.from(priceChanges)
			.where(eq(priceChanges.productId, productId))
			.orderBy(desc(priceChanges.createdAt), desc(priceChanges.id));
	}
}
