import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import {
	useDashboard,
	useInvoices,
	usePurchaseOrders,
	useSales,
	useStockAlerts,
	useStore,
} from "@/api/hooks";
import type { Dashboard, SaleSummary } from "@/api/types";
import { ErrorNote, Money, PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addDays, startOfDay, toISODate } from "@/lib/dates";

const dayFullFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "short",
	day: "numeric",
});
const dayShortFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	day: "numeric",
});

const PRESETS = [
	{ key: "today", label: "Today", days: 1 },
	{ key: "7", label: "7 days", days: 7 },
	{ key: "30", label: "30 days", days: 30 },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

/** A closed range of local calendar days. `last` is included. */
type Period = { first: Date; last: Date; days: number; label: string };

function presetPeriod(days: number): Period {
	const last = startOfDay(new Date());
	return {
		first: addDays(last, -(days - 1)),
		last,
		days,
		label: days === 1 ? "today" : `the last ${days} days`,
	};
}

function customPeriod(from: string, to: string): Period | null {
	const first = parseISODate(from);
	const last = parseISODate(to);
	if (!first || !last || last < first) {
		return null;
	}
	const days = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
	return {
		first,
		last,
		days,
		label:
			days === 1
				? dayShortFormat.format(first)
				: `${dayShortFormat.format(first)} to ${dayShortFormat.format(last)}`,
	};
}

function parseISODate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}
	const [year, month, date] = value.split("-").map(Number);
	const parsed = new Date(year, month - 1, date);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sum(sales: SaleSummary[], field: "total" | "totalProfit"): number {
	return sales.reduce((running, sale) => running + Number(sale[field]), 0);
}

/** Percentage change, or null when the base period had nothing to compare. */
function changeAgainst(current: number, previous: number): number | null {
	return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function plural(count: number, noun: string): string {
	return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function share(part: number, whole: number): string {
	return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;
}

/** Why a figure is missing. A pending query must never read as a real zero. */
function statusNote(query: { isError: boolean }): string {
	return query.isError ? "not available" : "still loading";
}

/** "19.7% of revenue", or a plain sentence when there is no revenue to divide. */
function shareNote(part: number, revenue: number, suffix: string): string {
	return revenue === 0
		? "no revenue in this period"
		: `${share(part, revenue)} of revenue${suffix}`;
}

function Delta({
	change,
	goodDirection,
	baseLabel,
}: {
	change: number | null;
	goodDirection: "up" | "down";
	baseLabel: string;
}) {
	if (change === null) {
		return (
			<span className="text-xs text-muted-foreground">
				nothing in the {baseLabel} before
			</span>
		);
	}
	const flat = Math.abs(change) < 0.5;
	const up = change > 0;
	const good = up === (goodDirection === "up");
	const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-baseline gap-1 text-xs tabular-nums ${
				flat
					? "text-muted-foreground"
					: good
						? "text-primary"
						: "text-destructive"
			}`}
		>
			<Icon aria-hidden className="size-3 translate-y-0.5" />
			{flat
				? `level with the ${baseLabel} before`
				: `${Math.abs(change).toFixed(0)}% vs the ${baseLabel} before`}
		</span>
	);
}

function Figure({
	label,
	value,
	note,
	delta,
	tone,
}: {
	label: string;
	value: ReactNode;
	note: ReactNode;
	delta?: ReactNode;
	tone?: "loss";
}) {
	return (
		<div className="bg-background py-4 sm:px-5 sm:first:pl-0">
			<dt className="text-xs tracking-wide text-muted-foreground uppercase">
				{label}
			</dt>
			<dd
				className={`font-display text-2xl font-semibold tabular-nums ${
					tone === "loss" ? "text-destructive" : ""
				}`}
			>
				{value}
			</dd>
			<dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>
			{delta ? <dd className="mt-0.5">{delta}</dd> : null}
		</div>
	);
}

type DayEntry = {
	date: Date;
	key: string;
	revenue: number;
	profit: number;
	count: number;
	/** False for days charted only to give a short period some context. */
	inPeriod: boolean;
};

/** A one-day period has no shape of its own, so chart a fortnight around it. */
const MINIMUM_CHART_DAYS = 14;

function RevenueChart({ entries }: { entries: DayEntry[] }) {
	const peak = entries.reduce(
		(high, entry) => Math.max(high, entry.revenue),
		0,
	);
	const selling = entries.filter((entry) => entry.revenue > 0);
	const average =
		selling.length === 0
			? 0
			: selling.reduce((running, entry) => running + entry.revenue, 0) /
				selling.length;
	// Labels thin out as columns multiply, counted back from the most recent day
	// so the newest column — the one being read — is always named.
	const labelEvery = Math.ceil(entries.length / 12);
	// A phone has room for roughly a third as many before they collide.
	const narrowLabelEvery = labelEvery * 3;
	const useWeekday = entries.length <= 10;
	const context = entries.some((entry) => !entry.inPeriod);

	if (peak === 0) {
		return (
			<p className="border-y py-10 text-sm text-muted-foreground">
				No sale was recorded in this period, so there is nothing to chart yet.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-display text-sm font-semibold">
					Revenue by day
					{context ? (
						<span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
							last {entries.length} days · the chosen period is the darker part
						</span>
					) : null}
				</h2>
				<p className="text-xs text-muted-foreground">
					Filled to profit · dashed line is the{" "}
					<span className="tabular-nums">
						<Money value={average.toFixed(2)} />
					</span>{" "}
					daily average
				</p>
			</div>

			<div className="relative flex h-44 items-end gap-px border-b">
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/45"
					style={{ bottom: `${(average / peak) * 100}%` }}
				/>
				{entries.map((entry) => {
					const height = peak === 0 ? 0 : (entry.revenue / peak) * 100;
					const profitShare =
						entry.revenue <= 0
							? 0
							: Math.max(0, Math.min(1, entry.profit / entry.revenue)) * 100;
					return (
						<Link
							key={entry.key}
							to={`/sales?day=${entry.key}`}
							title={`${dayFullFormat.format(entry.date)} — ${plural(entry.count, "sale")}`}
							aria-label={`${dayFullFormat.format(entry.date)}: ${plural(entry.count, "sale")}. Open this day in Sales.`}
							className="group flex h-full flex-1 items-end justify-center rounded-t-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{entry.revenue > 0 ? (
								<span
									className={`flex w-full max-w-16 flex-col justify-end overflow-hidden rounded-t-sm transition-colors ${
										entry.inPeriod
											? "bg-ledger-cost/40 group-hover:bg-ledger-cost/70"
											: "bg-ledger-cost/15 group-hover:bg-ledger-cost/40"
									}`}
									style={{ height: `${Math.max(height, 1.5)}%` }}
								>
									<span
										className={`w-full transition-colors ${
											entry.inPeriod
												? "bg-primary/80 group-hover:bg-primary"
												: "bg-primary/25 group-hover:bg-primary/50"
										}`}
										style={{ height: `${profitShare}%` }}
									/>
								</span>
							) : (
								<span className="h-px w-full max-w-16 bg-border transition-colors group-hover:bg-muted-foreground" />
							)}
						</Link>
					);
				})}
			</div>

			<div className="flex min-h-4 gap-px">
				{entries.map((entry, index) => {
					const fromEnd = entries.length - 1 - index;
					if (fromEnd % labelEvery !== 0) {
						// The empty span still holds its column, keeping labels aligned.
						return <span key={entry.key} className="min-w-0 flex-1" />;
					}
					const label = useWeekday
						? weekdayFormat.format(entry.date)
						: dayShortFormat.format(entry.date);
					// A column is narrower than its label, so a centred end label
					// would spill outside the chart. Pin those two to the edge.
					const edge =
						index === 0
							? "left-0"
							: index === entries.length - 1
								? "right-0"
								: null;
					return (
						<span
							key={entry.key}
							className={`relative min-w-0 flex-1 text-center text-[0.6875rem] whitespace-nowrap tabular-nums ${
								entry.inPeriod
									? "text-muted-foreground"
									: "text-muted-foreground/60"
							} ${fromEnd % narrowLabelEvery === 0 ? "" : "max-sm:invisible"}`}
						>
							{edge ? (
								<span className={`absolute top-0 ${edge}`}>{label}</span>
							) : (
								label
							)}
						</span>
					);
				})}
			</div>
		</div>
	);
}

type Signal = {
	key: string;
	count: number;
	headline: string;
	detail: string;
	amount?: string;
	to: string;
};

function Attention({ signals }: { signals: Signal[] }) {
	if (signals.length === 0) {
		return (
			<div className="border-y py-6">
				<p className="text-sm">Nothing needs attention.</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Stock covers the days ahead, every invoice is settled, and no delivery
					is outstanding.
				</p>
			</div>
		);
	}
	return (
		<ul className="divide-y border-y">
			{signals.map((signal) => (
				<li key={signal.key}>
					<Link
						to={signal.to}
						className="group flex items-center gap-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<span className="w-10 shrink-0 text-right font-display text-xl font-semibold tabular-nums">
							{signal.count}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-sm">{signal.headline}</span>
							<span className="block truncate text-xs text-muted-foreground">
								{signal.detail}
							</span>
						</span>
						{signal.amount ? (
							<span className="shrink-0 text-sm text-ledger-spend">
								<Money value={signal.amount} />
							</span>
						) : null}
						<ArrowRight
							aria-hidden
							className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
						/>
					</Link>
				</li>
			))}
		</ul>
	);
}

function TopProducts({
	rows,
	revenueTotal,
}: {
	rows: Dashboard["topProducts"];
	revenueTotal: number;
}) {
	if (rows.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No product sold in this period.
			</p>
		);
	}
	const peak = rows.reduce(
		(high, row) => Math.max(high, Number(row.revenue)),
		0,
	);
	return (
		<ol className="space-y-3.5">
			{rows.map((row) => {
				const revenue = Number(row.revenue);
				return (
					<li key={row.productId} className="space-y-1.5">
						<div className="flex items-baseline justify-between gap-3 text-sm">
							<span className="truncate font-medium">{row.name}</span>
							<span className="shrink-0">
								<Money value={row.revenue} />
							</span>
						</div>
						<span className="block h-1.5 rounded-full bg-muted">
							<span
								className="block h-full rounded-full bg-primary"
								style={{
									width: `${peak === 0 ? 0 : Math.max((revenue / peak) * 100, 2)}%`,
								}}
							/>
						</span>
						<p className="text-xs text-muted-foreground tabular-nums">
							{row.unitsSold.toLocaleString()} sold ·{" "}
							{share(revenue, revenueTotal)} of revenue · profit{" "}
							<Money value={row.profit} />
						</p>
					</li>
				);
			})}
		</ol>
	);
}

function Balance({
	label,
	value,
	note,
	to,
}: {
	label: string;
	value: string | null;
	note: string;
	to: string;
}) {
	return (
		<Link
			to={to}
			className="group block py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<p className="text-xs tracking-wide text-muted-foreground uppercase">
				{label}
			</p>
			<p className="font-display text-xl font-semibold text-ledger-spend tabular-nums">
				<Money value={value} />
			</p>
			<p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
				{note}
				<ArrowRight
					aria-hidden
					className="size-3 transition-transform group-hover:translate-x-0.5"
				/>
			</p>
		</Link>
	);
}

export default function DashboardPage() {
	const [preset, setPreset] = useState<PresetKey | "custom">("30");
	const today = toISODate(startOfDay(new Date()));
	const [customFrom, setCustomFrom] = useState(
		toISODate(addDays(startOfDay(new Date()), -13)),
	);
	const [customTo, setCustomTo] = useState(today);

	const period = useMemo((): Period => {
		if (preset === "custom") {
			return customPeriod(customFrom, customTo) ?? presetPeriod(30);
		}
		const chosen = PRESETS.find((entry) => entry.key === preset) ?? PRESETS[2];
		return presetPeriod(chosen.days);
	}, [preset, customFrom, customTo]);

	// The API takes an exclusive upper bound; the period's last day is included.
	const apiRange = useMemo(
		() => ({
			from: toISODate(period.first),
			to: toISODate(addDays(period.last, 1)),
		}),
		[period],
	);

	// The chart never shows fewer than a fortnight: one bar carries no trend, so
	// a short period is drawn against the days around it, muted.
	const chartFirst = useMemo(
		() =>
			addDays(period.last, -(Math.max(period.days, MINIMUM_CHART_DAYS) - 1)),
		[period],
	);

	// One sales query covers the chart window and the previous period, padded by
	// a day at each end so bucketing into LOCAL days never clips a UTC-filtered
	// edge.
	const salesRange = useMemo(() => {
		const previousFirst = addDays(period.first, -period.days);
		const earliest = chartFirst < previousFirst ? chartFirst : previousFirst;
		return {
			from: toISODate(addDays(earliest, -1)),
			to: toISODate(addDays(period.last, 2)),
		};
	}, [period, chartFirst]);

	const dashboard = useDashboard(apiRange);
	const sales = useSales(salesRange);
	const alerts = useStockAlerts();
	const invoices = useInvoices();
	const orders = usePurchaseOrders();
	const store = useStore();

	const entries = useMemo((): DayEntry[] => {
		const byDay = new Map<string, SaleSummary[]>();
		for (const sale of sales.data ?? []) {
			const key = toISODate(new Date(sale.soldAt));
			const bucket = byDay.get(key);
			if (bucket) {
				bucket.push(sale);
			} else {
				byDay.set(key, [sale]);
			}
		}
		const firstKey = toISODate(period.first);
		const span =
			Math.round((period.last.getTime() - chartFirst.getTime()) / 86_400_000) +
			1;
		return Array.from({ length: span }, (_, index) => {
			const date = addDays(chartFirst, index);
			const key = toISODate(date);
			const daySales = byDay.get(key) ?? [];
			return {
				date,
				key,
				revenue: sum(daySales, "total"),
				profit: sum(daySales, "totalProfit"),
				count: daySales.length,
				inPeriod: key >= firstKey,
			};
		});
	}, [sales.data, period, chartFirst]);

	// The figure band only ever counts the days the reader actually chose.
	const periodEntries = useMemo(
		() => entries.filter((entry) => entry.inPeriod),
		[entries],
	);

	const previousEntries = useMemo(() => {
		const firstKey = toISODate(addDays(period.first, -period.days));
		const lastKey = toISODate(period.first);
		return (sales.data ?? []).filter((sale) => {
			const key = toISODate(new Date(sale.soldAt));
			return key >= firstKey && key < lastKey;
		});
	}, [sales.data, period]);

	const revenue = periodEntries.reduce(
		(running, entry) => running + entry.revenue,
		0,
	);
	const profit = periodEntries.reduce(
		(running, entry) => running + entry.profit,
		0,
	);
	const saleCount = periodEntries.reduce(
		(running, entry) => running + entry.count,
		0,
	);
	const previousRevenue = sum(previousEntries, "total");
	const previousProfit = sum(previousEntries, "totalProfit");

	const facts = dashboard.data;
	const salesReady = sales.data !== undefined;
	const expenses = facts ? Number(facts.expensesTotal) : null;
	const net = expenses === null ? null : profit - expenses;
	const baseLabel = period.days === 1 ? "day" : `${period.days} days`;

	const signals = useMemo((): Signal[] => {
		const list: Signal[] = [];
		const coverDays = store.data?.lowStockCoverDays ?? 5;
		const low = (alerts.data ?? []).filter((alert) => alert.low);
		if (low.length > 0) {
			const soonest = low[0];
			list.push({
				key: "stock",
				count: low.length,
				headline: `${low.length === 1 ? "product runs" : "products run"} out within ${coverDays} days at the current rate`,
				detail: soonest.daysToStockout
					? `Soonest: ${soonest.name}, about ${plural(Math.round(Number(soonest.daysToStockout)), "day")} left`
					: `Soonest: ${soonest.name}`,
				to: "/projections",
			});
		}

		const cutoff = addDays(startOfDay(new Date()), -30);
		const stale = (invoices.data ?? [])
			.filter((invoice) => Number(invoice.balance) > 0)
			.filter((invoice) => new Date(invoice.issuedAt) < cutoff)
			.sort(
				(left, right) =>
					new Date(left.issuedAt).getTime() -
					new Date(right.issuedAt).getTime(),
			);
		if (stale.length > 0) {
			const owed = stale.reduce(
				(running, invoice) => running + Number(invoice.balance),
				0,
			);
			list.push({
				key: "invoices",
				count: stale.length,
				headline: `${stale.length === 1 ? "invoice has" : "invoices have"} gone unpaid for more than 30 days`,
				detail: `Oldest: ${stale[0].customerName}, issued ${dayShortFormat.format(new Date(stale[0].issuedAt))}`,
				amount: owed.toFixed(2),
				to: "/invoices",
			});
		}

		const openOrders = (orders.data ?? []).filter(
			(order) => order.status !== "received",
		);
		if (openOrders.length > 0) {
			const value = openOrders.reduce(
				(running, order) => running + Number(order.totalValue),
				0,
			);
			const partial = openOrders.filter(
				(order) => order.status === "partially_received",
			).length;
			list.push({
				key: "orders",
				count: openOrders.length,
				headline: `purchase ${openOrders.length === 1 ? "order is" : "orders are"} still waiting on a delivery`,
				detail:
					partial > 0
						? `${partial} of them arrived only in part`
						: "None have been signed off yet",
				amount: value.toFixed(2),
				to: "/purchase-orders",
			});
		}
		return list;
	}, [alerts.data, invoices.data, orders.data, store.data]);

	// Each query is named, so a partial failure says which half of the page is
	// missing instead of blanking all of it.
	const failures = [
		dashboard.isError ? `Period totals: ${dashboard.error.message}` : null,
		sales.isError ? `Daily sales: ${sales.error.message}` : null,
		alerts.isError ? `Stock alerts: ${alerts.error.message}` : null,
		invoices.isError ? `Invoices: ${invoices.error.message}` : null,
		orders.isError ? `Purchase orders: ${orders.error.message}` : null,
	].filter((message): message is string => message !== null);
	// The attention list is a claim about three queries; "nothing to do" must not
	// be shown until all three have actually answered.
	const signalsReady =
		!alerts.isPending && !invoices.isPending && !orders.isPending;
	// Only the very first paint, with nothing to show yet, is a blank page.
	const loading = dashboard.isPending && sales.isPending;

	return (
		<div>
			<PageHeader
				title="Dashboard"
				description={`Revenue, profit, and what needs doing. Figures cover ${period.label}.`}
				action={
					<div className="flex flex-wrap items-center gap-1 rounded-lg border p-1">
						{PRESETS.map((entry) => (
							<Button
								key={entry.key}
								type="button"
								size="sm"
								variant={preset === entry.key ? "secondary" : "ghost"}
								aria-pressed={preset === entry.key}
								onClick={() => setPreset(entry.key)}
							>
								{entry.label}
							</Button>
						))}
						<Button
							type="button"
							size="sm"
							variant={preset === "custom" ? "secondary" : "ghost"}
							aria-pressed={preset === "custom"}
							onClick={() => setPreset("custom")}
						>
							Custom
						</Button>
					</div>
				}
			/>

			{preset === "custom" ? (
				<div className="mb-8 flex flex-wrap items-end gap-4 border-t pt-4">
					<Field className="w-44">
						<FieldLabel htmlFor="d-from">First day</FieldLabel>
						<Input
							id="d-from"
							type="date"
							max={today}
							className="tabular-nums"
							value={customFrom}
							onChange={(event) => setCustomFrom(event.target.value)}
						/>
					</Field>
					<Field className="w-44">
						<FieldLabel htmlFor="d-to">Last day</FieldLabel>
						<Input
							id="d-to"
							type="date"
							max={today}
							className="tabular-nums"
							value={customTo}
							onChange={(event) => setCustomTo(event.target.value)}
						/>
					</Field>
					<p className="pb-2 text-xs text-muted-foreground">
						Both days are counted.
						{customPeriod(customFrom, customTo)
							? ` ${period.days} ${period.days === 1 ? "day" : "days"} in view.`
							: " The last day must not come before the first."}
					</p>
				</div>
			) : null}

			{failures.length > 0 ? (
				<div className="mb-8 space-y-2">
					{failures.map((message) => (
						<ErrorNote key={message} message={message} />
					))}
				</div>
			) : null}

			{loading ? (
				<p className="py-10 text-sm text-muted-foreground">
					Gathering the numbers…
				</p>
			) : (
				<div className="space-y-12">
					<dl className="grid gap-px border-y bg-border sm:grid-cols-2 lg:grid-cols-4">
						<Figure
							label="Revenue"
							value={<Money value={salesReady ? revenue.toFixed(2) : null} />}
							note={
								<span className="tabular-nums">
									{salesReady ? plural(saleCount, "sale") : statusNote(sales)}
								</span>
							}
							delta={
								salesReady ? (
									<Delta
										change={changeAgainst(revenue, previousRevenue)}
										goodDirection="up"
										baseLabel={baseLabel}
									/>
								) : undefined
							}
						/>
						<Figure
							label="Gross profit"
							value={<Money value={salesReady ? profit.toFixed(2) : null} />}
							note={
								salesReady ? shareNote(profit, revenue, "") : statusNote(sales)
							}
							delta={
								salesReady ? (
									<Delta
										change={changeAgainst(profit, previousProfit)}
										goodDirection="up"
										baseLabel={baseLabel}
									/>
								) : undefined
							}
						/>
						<Figure
							label="Expenses"
							value={<Money value={facts?.expensesTotal ?? null} />}
							note={
								expenses === null
									? statusNote(dashboard)
									: shareNote(expenses, revenue, "")
							}
						/>
						<Figure
							label="Net profit"
							value={<Money value={net === null ? null : net.toFixed(2)} />}
							tone={net !== null && net < 0 ? "loss" : undefined}
							note={
								net === null
									? statusNote(sales.isError ? sales : dashboard)
									: net < 0
										? "costs ran past revenue"
										: shareNote(net, revenue, " kept")
							}
						/>
					</dl>

					{salesReady ? (
						<RevenueChart entries={entries} />
					) : (
						<p className="border-y py-10 text-sm text-muted-foreground">
							{sales.isError
								? "The daily sales could not be read."
								: "Gathering the daily sales…"}
						</p>
					)}

					<section className="space-y-3">
						<h2 className="font-display text-sm font-semibold">
							Needs attention
						</h2>
						{signalsReady ? (
							<Attention signals={signals} />
						) : (
							<p className="border-y py-6 text-sm text-muted-foreground">
								Checking stock, invoices, and deliveries…
							</p>
						)}
					</section>

					<div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
						<section className="space-y-4">
							<h2 className="font-display text-sm font-semibold">
								Top products by revenue
							</h2>
							{facts ? (
								<TopProducts
									rows={facts.topProducts}
									revenueTotal={Number(facts.salesTotal)}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									{dashboard.isError
										? "The period totals could not be read."
										: "Gathering the numbers…"}
								</p>
							)}
						</section>

						<section className="space-y-3">
							<h2 className="font-display text-sm font-semibold">
								Standing balances
							</h2>
							<div className="divide-y border-y">
								<Balance
									label="Owed by customers"
									value={facts?.customerReceivable ?? null}
									note="Open invoices"
									to="/invoices"
								/>
								<Balance
									label="Owed to suppliers"
									value={facts?.supplierPayable ?? null}
									note="Unpaid purchases"
									to="/suppliers"
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								Both are what the books say right now, whatever period is
								selected above.
							</p>
						</section>
					</div>
				</div>
			)}
		</div>
	);
}
