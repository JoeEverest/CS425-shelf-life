import type { Database } from "db";
import {
	customers,
	invoices,
	products,
	saleLines,
	sales,
	stockLevels,
	stockMovements,
	users,
} from "db/schema";
import { and, count, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import type { SaleCreateInput, SalesListQuery } from "shared";
import { centsToMoney, moneyToCents } from "../rules/money";

export class ProductNotSellableRepoError extends Error {
	constructor(
		readonly productId: string,
		readonly sku?: string,
		readonly productName?: string,
	) {
		super("Product is not sellable.");
	}
}

export class SaleInsufficientStockRepoError extends Error {
	constructor(readonly productId: string) {
		super("Insufficient stock.");
	}
}

export class SaleCustomerNotFoundRepoError extends Error {}

const saleSelection = {
	id: sales.id,
	clerkId: sales.clerkId,
	clerkName: users.name,
	soldAt: sales.soldAt,
	type: sales.type,
	total: sales.total,
	totalProfit: sales.totalProfit,
	createdAt: sales.createdAt,
};

const saleLineSelection = {
	id: saleLines.id,
	productId: saleLines.productId,
	productName: products.name,
	sku: products.sku,
	qtyUnits: saleLines.qtyUnits,
	unitPriceAtSale: saleLines.unitPriceAtSale,
	unitCostAtSale: saleLines.unitCostAtSale,
	lineCogs: saleLines.lineCogs,
	lineProfit: saleLines.lineProfit,
	createdAt: saleLines.createdAt,
};

type PricedSaleLine = {
	index: number;
	productId: string;
	productName: string;
	sku: string;
	qtyUnits: number;
	unitPriceAtSale: string;
	unitCostAtSale: string;
	lineTotal: string;
	lineCogs: string;
	lineProfit: string;
};

export class SalesRepo {
	constructor(private readonly database: Database) {}

	async createSale(input: SaleCreateInput, clerkId: string): Promise<string> {
		return this.database.transaction(async (transaction) => {
			if (input.type === "credit") {
				const [customer] = await transaction
					.select({ id: customers.id })
					.from(customers)
					.where(eq(customers.id, input.customerId))
					.for("update");
				if (!customer) {
					throw new SaleCustomerNotFoundRepoError();
				}
			}

			const pricedLines: PricedSaleLine[] = [];

			// A stable lock order avoids deadlocks when concurrent multi-line sales
			// contain the same products in a different client order.
			const orderedLines = input.lines
				.map((line, index) => ({ ...line, index }))
				.sort((left, right) => left.productId.localeCompare(right.productId));

			for (const line of orderedLines) {
				const [product] = await transaction
					.select({
						id: products.id,
						name: products.name,
						sku: products.sku,
						price: products.price,
						published: products.published,
						archived: products.archived,
						unitCostAtSale: sql<string>`round(${products.bulkCost} / ${products.unitsPerBulk}, 4)::numeric(12,4)`,
						lineTotal: sql<
							string | null
						>`(${products.price} * ${line.qtyUnits})::numeric(12,2)`,
						lineCogs: sql<string>`round(${products.bulkCost} * ${line.qtyUnits} / ${products.unitsPerBulk}, 2)::numeric(12,2)`,
						lineProfit: sql<
							string | null
						>`(${products.price} * ${line.qtyUnits} - round(${products.bulkCost} * ${line.qtyUnits} / ${products.unitsPerBulk}, 2))::numeric(12,2)`,
					})
					.from(products)
					.where(eq(products.id, line.productId))
					.for("update");

				if (
					!product?.published ||
					product.archived ||
					product.price === null ||
					product.lineTotal === null ||
					product.lineProfit === null
				) {
					throw new ProductNotSellableRepoError(
						line.productId,
						product?.sku,
						product?.name,
					);
				}

				pricedLines.push({
					index: line.index,
					productId: product.id,
					productName: product.name,
					sku: product.sku,
					qtyUnits: line.qtyUnits,
					unitPriceAtSale: product.price,
					unitCostAtSale: product.unitCostAtSale,
					lineTotal: product.lineTotal,
					lineCogs: product.lineCogs,
					lineProfit: product.lineProfit,
				});
			}

			const total = centsToMoney(
				pricedLines.reduce(
					(sum, line) => sum + moneyToCents(line.lineTotal),
					0n,
				),
			);
			const totalProfit = centsToMoney(
				pricedLines.reduce(
					(sum, line) => sum + moneyToCents(line.lineProfit),
					0n,
				),
			);

			const [sale] = await transaction
				.insert(sales)
				.values({
					clerkId,
					type: input.type,
					total,
					totalProfit,
				})
				.returning({ id: sales.id });
			if (!sale) {
				throw new Error("Failed to create sale.");
			}

			for (const line of pricedLines.sort(
				(left, right) => left.index - right.index,
			)) {
				const [stockLevel] = await transaction
					.update(stockLevels)
					.set({
						qtyUnits: sql`${stockLevels.qtyUnits} - ${line.qtyUnits}`,
					})
					.where(
						and(
							eq(stockLevels.productId, line.productId),
							gte(stockLevels.qtyUnits, line.qtyUnits),
						),
					)
					.returning({ productId: stockLevels.productId });
				if (!stockLevel) {
					throw new SaleInsufficientStockRepoError(line.productId);
				}

				const [saleLine] = await transaction
					.insert(saleLines)
					.values({
						saleId: sale.id,
						productId: line.productId,
						qtyUnits: line.qtyUnits,
						unitPriceAtSale: line.unitPriceAtSale,
						unitCostAtSale: line.unitCostAtSale,
						lineCogs: line.lineCogs,
						lineProfit: line.lineProfit,
					})
					.returning({ id: saleLines.id });
				if (!saleLine) {
					throw new Error("Failed to create sale line.");
				}

				await transaction.insert(stockMovements).values({
					productId: line.productId,
					deltaUnits: -line.qtyUnits,
					reason: input.type === "credit" ? "credit_sale" : "sale",
					refTable: "sale_lines",
					refId: saleLine.id,
					actorId: clerkId,
				});
			}

			if (input.type === "credit") {
				await transaction.insert(invoices).values({
					saleId: sale.id,
					customerId: input.customerId,
					total,
					balance: total,
				});
				await transaction
					.update(customers)
					.set({
						outstandingBalance: sql`${customers.outstandingBalance} + ${total}`,
					})
					.where(eq(customers.id, input.customerId));
			}

			return sale.id;
		});
	}

	listSales(period: SalesListQuery) {
		const filters: SQL[] = [];
		if (period.from) {
			filters.push(
				sql`${sales.soldAt} >= (${period.from}::date::timestamp at time zone 'UTC')`,
			);
		}
		if (period.to) {
			filters.push(
				sql`${sales.soldAt} < (${period.to}::date::timestamp at time zone 'UTC')`,
			);
		}

		const query = this.database
			.select({
				...saleSelection,
				lineCount: count(saleLines.id),
			})
			.from(sales)
			.innerJoin(users, eq(users.id, sales.clerkId))
			.leftJoin(saleLines, eq(saleLines.saleId, sales.id))
			.groupBy(sales.id, users.id)
			.orderBy(desc(sales.soldAt), desc(sales.createdAt))
			.limit(100);

		return filters.length > 0 ? query.where(and(...filters)) : query;
	}

	async findSaleById(id: string) {
		const [sale] = await this.database
			.select(saleSelection)
			.from(sales)
			.innerJoin(users, eq(users.id, sales.clerkId))
			.where(eq(sales.id, id));
		if (!sale) {
			return undefined;
		}

		const lines = await this.database
			.select(saleLineSelection)
			.from(saleLines)
			.innerJoin(products, eq(products.id, saleLines.productId))
			.where(eq(saleLines.saleId, id))
			.orderBy(saleLines.createdAt, saleLines.id);
		return { ...sale, lines };
	}
}
