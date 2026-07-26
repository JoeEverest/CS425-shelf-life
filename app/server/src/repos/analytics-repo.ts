import type { Database } from "db";
import {
	customers,
	expenses,
	products,
	saleLines,
	sales,
	stockLevels,
	stockMovements,
	stores,
	suppliers,
} from "db/schema";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { qualifyingStockMovementInConfiguredWindow } from "./stock-velocity-query";

export type DashboardPeriod = {
	from: Date;
	to: Date;
};

export class AnalyticsRepo {
	constructor(private readonly database: Database) {}

	listStockProjectionInputs() {
		return this.database
			.select({
				productId: products.id,
				sku: products.sku,
				name: products.name,
				qtyUnits: stockLevels.qtyUnits,
				saleUnitName: products.saleUnitName,
				unitsSoldInWindow: sql<number>`coalesce(sum(-${stockMovements.deltaUnits}), 0)::double precision`,
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

	async dashboard(period: DashboardPeriod) {
		// Bind the boundaries as date strings and cast in SQL — postgres.js
		// cannot serialize a JS Date embedded in a raw sql fragment.
		const fromStr = period.from.toISOString().slice(0, 10);
		const toStr = period.to.toISOString().slice(0, 10);
		const fromUtc = sql`(${fromStr}::date::timestamp at time zone 'UTC')`;
		const toUtc = sql`(${toStr}::date::timestamp at time zone 'UTC')`;
		const salesPeriod = sql`${sales.soldAt} >= ${fromUtc} and ${sales.soldAt} < ${toUtc}`;
		const expensePeriod = sql`${expenses.incurredOn} >= ${fromStr}::date and ${expenses.incurredOn} < ${toStr}::date`;
		const expensesTotalSql = sql<string>`coalesce((
			select sum(${expenses.amount})
			from ${expenses}
			where ${expensePeriod}
		), 0)::numeric(12,2)`;

		const summaryPromise = this.database
			.select({
				salesTotal: sql<string>`coalesce(sum(${sales.total}), 0)::numeric(12,2)`,
				salesProfit: sql<string>`coalesce(sum(${sales.totalProfit}), 0)::numeric(12,2)`,
				salesCount: sql<number>`${count()}::int`,
				expensesTotal: expensesTotalSql,
				netProfit: sql<string>`(coalesce(sum(${sales.totalProfit}), 0) - ${expensesTotalSql})::numeric(12,2)`,
			})
			.from(sales)
			.where(salesPeriod);

		const revenue = sql<string>`sum(${saleLines.qtyUnits} * ${saleLines.unitPriceAtSale})::numeric(12,2)`;
		const topProductsPromise = this.database
			.select({
				productId: products.id,
				name: products.name,
				sku: products.sku,
				unitsSold: sql<number>`sum(${saleLines.qtyUnits})::int`,
				revenue,
				profit: sql<string>`sum(${saleLines.lineProfit})::numeric(12,2)`,
			})
			.from(saleLines)
			.innerJoin(sales, eq(sales.id, saleLines.saleId))
			.innerJoin(products, eq(products.id, saleLines.productId))
			.where(salesPeriod)
			.groupBy(products.id)
			.orderBy(desc(revenue), asc(products.name), asc(products.id))
			.limit(5);

		const balancesPromise = this.database
			.select({
				supplierPayable: sql<string>`coalesce((select sum(${suppliers.outstandingBalance}) from ${suppliers}), 0)::numeric(12,2)`,
				customerReceivable: sql<string>`coalesce((select sum(${customers.outstandingBalance}) from ${customers}), 0)::numeric(12,2)`,
			})
			.from(sql`(select 1) as balance_totals`);

		const velocityRows = this.database
			.select({
				qtyUnits: stockLevels.qtyUnits,
				unitsSoldInWindow:
					sql<number>`coalesce(sum(-${stockMovements.deltaUnits}), 0)::double precision`.as(
						"units_sold_in_window",
					),
				windowDays: stores.velocityWindowDays,
				coverDays: stores.lowStockCoverDays,
			})
			.from(products)
			.innerJoin(stockLevels, eq(stockLevels.productId, products.id))
			.innerJoin(stores, sql`true`)
			.leftJoin(stockMovements, qualifyingStockMovementInConfiguredWindow)
			.where(eq(products.archived, false))
			.groupBy(products.id, stockLevels.productId, stores.id)
			.as("stock_velocity");
		const lowStockPromise = this.database
			.select({
				lowStockCount: sql<number>`count(*) filter (
					where case
						when ${velocityRows.unitsSoldInWindow} > 0
						then ${velocityRows.qtyUnits}::numeric / (${velocityRows.unitsSoldInWindow}::numeric / ${velocityRows.windowDays}) <= ${velocityRows.coverDays}
						else false
					end
				)::int`,
			})
			.from(velocityRows);

		const [summaryRows, topProducts, balanceRows, lowStockRows] =
			await Promise.all([
				summaryPromise,
				topProductsPromise,
				balancesPromise,
				lowStockPromise,
			]);

		const summary = summaryRows[0];
		const balances = balanceRows[0];
		return {
			salesTotal: summary?.salesTotal ?? "0.00",
			salesProfit: summary?.salesProfit ?? "0.00",
			salesCount: summary?.salesCount ?? 0,
			topProducts,
			lowStockCount: lowStockRows[0]?.lowStockCount ?? 0,
			supplierPayable: balances?.supplierPayable ?? "0.00",
			customerReceivable: balances?.customerReceivable ?? "0.00",
			expensesTotal: summary?.expensesTotal ?? "0.00",
			netProfit: summary?.netProfit ?? "0.00",
		};
	}
}
