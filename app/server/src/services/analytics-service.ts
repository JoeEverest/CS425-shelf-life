import type { DashboardQuery } from "shared";
import type { AnalyticsRepo, DashboardPeriod } from "../repos/analytics-repo";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export class AnalyticsService {
	constructor(private readonly analyticsRepo: AnalyticsRepo) {}

	dashboard(query: DashboardQuery) {
		return this.analyticsRepo.dashboard(this.resolvePeriod(query));
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
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate() + 1,
			),
		);
		return {
			from: new Date(to.getTime() - 30 * DAY_IN_MILLISECONDS),
			to,
		};
	}
}
