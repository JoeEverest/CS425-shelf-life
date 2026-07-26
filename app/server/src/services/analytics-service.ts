import type { DashboardQuery } from "shared";
import type { AnalyticsRepo, DashboardPeriod } from "../repos/analytics-repo";
import { calculateStockVelocity } from "../rules/stock-velocity";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export class AnalyticsService {
	constructor(private readonly analyticsRepo: AnalyticsRepo) {}

	dashboard(query: DashboardQuery) {
		return this.analyticsRepo.dashboard(this.resolvePeriod(query));
	}

	async projections() {
		const rows = await this.analyticsRepo.listStockProjectionInputs();
		return rows
			.map((row) => {
				const result = calculateStockVelocity({
					qtyUnits: row.qtyUnits,
					unitsSoldInWindow: row.unitsSoldInWindow,
					windowDays: row.windowDays,
					coverDays: row.coverDays,
				});
				return {
					productId: row.productId,
					sku: row.sku,
					name: row.name,
					qtyUnits: row.qtyUnits,
					saleUnitName: row.saleUnitName,
					velocityPerDay: result.velocityPerDay.toFixed(4),
					daysToStockout: result.daysToStockout?.toFixed(1) ?? null,
					hasHistory: result.velocityPerDay > 0,
					_sortDaysToStockout: result.daysToStockout,
				};
			})
			.sort((left, right) => {
				if (left._sortDaysToStockout === null) {
					return right._sortDaysToStockout === null ? 0 : 1;
				}
				if (right._sortDaysToStockout === null) {
					return -1;
				}
				return left._sortDaysToStockout - right._sortDaysToStockout;
			})
			.map(({ _sortDaysToStockout, ...projection }) => projection);
	}

	private resolvePeriod(query: DashboardQuery): DashboardPeriod {
		if (query.from && query.to) {
			return {
				from: new Date(`${query.from}T00:00:00.000Z`),
				to: new Date(`${query.to}T00:00:00.000Z`),
			};
		}

		// The repo compares against date boundaries with a half-open [from, to)
		// range, so the default `to` must be the START OF TOMORROW (UTC) for the
		// window to include today's sales — otherwise the current day is dropped.
		const now = new Date();
		const to = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
		);
		return {
			from: new Date(to.getTime() - 30 * DAY_IN_MILLISECONDS),
			to,
		};
	}
}
