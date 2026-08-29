import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Minus,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSale, useSales } from "@/api/hooks";
import type { SaleSummary } from "@/api/types";
import { EmptyState, ErrorNote, Money, PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { addDays, startOfDay, startOfWeek, toISODate } from "@/lib/dates";

const dayHeadingFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "short",
	day: "numeric",
	year: "numeric",
});
const weekLabelFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const timeFormat = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

function sumField(
	sales: SaleSummary[],
	field: "total" | "totalProfit",
): number {
	return sales.reduce((sum, sale) => sum + Number(sale[field]), 0);
}

function salesOn(sales: SaleSummary[], day: Date): SaleSummary[] {
	const key = toISODate(day);
	return sales.filter((sale) => toISODate(new Date(sale.soldAt)) === key);
}

/** Percentage change against the previous week; null when there is no base. */
function changeAgainst(current: number, previous: number): number | null {
	if (previous === 0) {
		return null;
	}
	return ((current - previous) / previous) * 100;
}

function Trend({ change }: { change: number | null }) {
	if (change === null) {
		return (
			<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
				<Minus aria-hidden className="size-3" />
				no sales last week
			</span>
		);
	}
	const flat = Math.abs(change) < 0.5;
	const up = change > 0;
	const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
	const tone = flat
		? "text-muted-foreground"
		: up
			? "text-primary"
			: "text-destructive";
	return (
		<span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
			<Icon aria-hidden className="size-3" />
			{flat ? "level with" : `${up ? "+" : ""}${change.toFixed(0)}% vs`} last
			week
		</span>
	);
}

function StatTile({
	label,
	value,
	change,
}: {
	label: string;
	value: React.ReactNode;
	change: number | null;
}) {
	return (
		<div className="rounded-xl border bg-card px-4 py-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="font-display text-xl font-semibold">{value}</p>
			<Trend change={change} />
		</div>
	);
}

function SaleLines({ saleId }: { saleId: string }) {
	const detail = useSale(saleId);
	if (detail.isError) {
		return <ErrorNote message={detail.error.message} />;
	}
	if (!detail.data) {
		return <p className="text-sm text-muted-foreground">Loading items…</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Item</TableHead>
					<TableHead className="text-right">Qty</TableHead>
					<TableHead className="text-right">Unit price</TableHead>
					<TableHead className="text-right">Line total</TableHead>
					<TableHead className="text-right">Profit</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{detail.data.lines.map((line) => (
					<TableRow key={line.id}>
						<TableCell>
							{line.productName}
							<span className="ml-2 text-xs text-muted-foreground tabular-nums">
								{line.sku}
							</span>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{line.qtyUnits}
							{line.saleUnitName ? (
								<span className="ml-1 text-muted-foreground">
									{line.saleUnitName}
								</span>
							) : null}
						</TableCell>
						<TableCell className="text-right">
							<Money value={line.unitPriceAtSale} />
						</TableCell>
						<TableCell className="text-right">
							<Money
								value={(Number(line.unitPriceAtSale) * line.qtyUnits).toFixed(
									2,
								)}
							/>
						</TableCell>
						<TableCell className="text-right">
							<Money value={line.lineProfit} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export default function SalesPage() {
	const [day, setDay] = useState(() => startOfDay(new Date()));
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const today = startOfDay(new Date());
	const isToday = toISODate(day) === toISODate(today);

	const weekStart = useMemo(() => startOfWeek(day), [day]);
	const weekDays = useMemo(
		() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
		[weekStart],
	);

	const weekRange = useMemo(
		() => ({
			from: toISODate(weekStart),
			to: toISODate(addDays(weekStart, 7)),
		}),
		[weekStart],
	);
	const previousRange = useMemo(
		() => ({
			from: toISODate(addDays(weekStart, -7)),
			to: toISODate(weekStart),
		}),
		[weekStart],
	);

	const week = useSales(weekRange);
	const previous = useSales(previousRange);

	const weekSales = week.data ?? [];
	const daySales = useMemo(() => salesOn(weekSales, day), [weekSales, day]);

	// Only stable state setters are used, so the handler needs no dependencies.
	const shiftDay = useCallback((days: number) => {
		setExpandedId(null);
		setDay((current) => {
			const next = addDays(current, days);
			return next > startOfDay(new Date()) ? current : next;
		});
	}, []);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}
			if (event.key === "ArrowLeft") {
				shiftDay(-1);
			} else if (event.key === "ArrowRight") {
				shiftDay(1);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shiftDay]);

	const weekRevenue = sumField(weekSales, "total");
	const weekProfit = sumField(weekSales, "totalProfit");
	const previousSales = previous.data ?? [];
	const previousRevenue = sumField(previousSales, "total");
	const previousProfit = sumField(previousSales, "totalProfit");

	const perDay = weekDays.map((date) => {
		const sales = salesOn(weekSales, date);
		return { date, revenue: sumField(sales, "total"), count: sales.length };
	});
	const peak = Math.max(...perDay.map((entry) => entry.revenue), 0);
	const best = perDay.reduce(
		(leader, entry) => (entry.revenue > leader.revenue ? entry : leader),
		perDay[0],
	);

	const weekLabel = `${weekLabelFormat.format(weekStart)} – ${weekLabelFormat.format(
		addDays(weekStart, 6),
	)}`;

	return (
		<div>
			<PageHeader
				title="Sales"
				description="One day at a time. The panel compares this day's week with the week before. Use the arrows or ← → keys to move between days."
			/>

			<section className="mb-8 space-y-4 rounded-xl border bg-muted/20 p-5">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="font-display text-lg font-semibold">
						Week of {weekLabel}
					</h2>
					<p className="text-sm text-muted-foreground">
						{best && best.revenue > 0 ? (
							<>
								Best day: {dayHeadingFormat.format(best.date).split(",")[0]} ·{" "}
								<Money value={best.revenue.toFixed(2)} />
							</>
						) : (
							"No sales this week yet."
						)}
					</p>
				</div>

				<div className="grid gap-3 sm:grid-cols-3">
					<StatTile
						label="Revenue"
						value={<Money value={weekRevenue.toFixed(2)} />}
						change={changeAgainst(weekRevenue, previousRevenue)}
					/>
					<StatTile
						label="Profit"
						value={<Money value={weekProfit.toFixed(2)} />}
						change={changeAgainst(weekProfit, previousProfit)}
					/>
					<StatTile
						label="Sales"
						value={<span className="tabular-nums">{weekSales.length}</span>}
						change={changeAgainst(weekSales.length, previousSales.length)}
					/>
				</div>

				<div className="flex items-end gap-2">
					{perDay.map((entry) => {
						const selected = toISODate(entry.date) === toISODate(day);
						const height =
							peak === 0 ? 4 : Math.max(4, (entry.revenue / peak) * 100);
						const ahead = entry.date > today;
						return (
							<button
								key={toISODate(entry.date)}
								type="button"
								disabled={ahead}
								onClick={() => {
									setExpandedId(null);
									setDay(entry.date);
								}}
								title={`${dayHeadingFormat.format(entry.date)} — ${entry.count} ${
									entry.count === 1 ? "sale" : "sales"
								}`}
								className="group flex flex-1 flex-col items-center gap-1.5 disabled:opacity-40"
							>
								<span className="text-xs text-muted-foreground tabular-nums">
									{entry.revenue > 0
										? Math.round(entry.revenue).toLocaleString()
										: ""}
								</span>
								<span className="flex h-24 w-full items-end">
									<span
										style={{ height: `${height}%` }}
										className={`w-full rounded-t-md transition-colors ${
											selected
												? "bg-primary"
												: "bg-primary/25 group-hover:bg-primary/45"
										}`}
									/>
								</span>
								<span
									className={`text-xs ${
										selected
											? "font-semibold text-foreground"
											: "text-muted-foreground"
									}`}
								>
									{weekdayFormat.format(entry.date)}
								</span>
							</button>
						);
					})}
				</div>
			</section>

			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => shiftDay(-1)}
						aria-label="Previous day"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<div className="min-w-56 text-center">
						<p className="font-display font-semibold">
							{dayHeadingFormat.format(day)}
						</p>
						{isToday ? (
							<p className="text-xs text-muted-foreground">Today</p>
						) : null}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => shiftDay(1)}
						disabled={isToday}
						aria-label="Next day"
					>
						<ChevronRight className="size-4" />
					</Button>
					{isToday ? null : (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setExpandedId(null);
								setDay(startOfDay(new Date()));
							}}
						>
							Today
						</Button>
					)}
				</div>
				<div className="flex gap-6 text-sm">
					<div>
						<span className="text-muted-foreground">Revenue </span>
						<span className="font-medium">
							<Money value={sumField(daySales, "total").toFixed(2)} />
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Profit </span>
						<span className="font-medium">
							<Money value={sumField(daySales, "totalProfit").toFixed(2)} />
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Sales </span>
						<span className="font-medium tabular-nums">{daySales.length}</span>
					</div>
				</div>
			</div>

			{week.isError ? <ErrorNote message={week.error.message} /> : null}

			{week.data && daySales.length === 0 ? (
				<EmptyState
					title="No sales on this day"
					hint="Nothing was sold. Pick another day with the arrows or the bars above, or record a sale on the Sell page."
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-8" />
							<TableHead>Time</TableHead>
							<TableHead>Customer</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Clerk</TableHead>
							<TableHead className="text-right">Items</TableHead>
							<TableHead className="text-right">Total</TableHead>
							<TableHead className="text-right">Profit</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{daySales.map((sale) => {
							const expanded = expandedId === sale.id;
							return (
								<Fragment key={sale.id}>
									<TableRow
										className="cursor-pointer"
										onClick={() => setExpandedId(expanded ? null : sale.id)}
									>
										<TableCell>
											<ChevronDown
												className={`size-4 text-muted-foreground transition-transform ${
													expanded ? "" : "-rotate-90"
												}`}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											{timeFormat.format(new Date(sale.soldAt))}
										</TableCell>
										<TableCell>
											{sale.customerName ?? (
												<span className="text-muted-foreground">Walk-in</span>
											)}
										</TableCell>
										<TableCell>
											{sale.type === "credit" ? "Credit" : "Cash"}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{sale.clerkName}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{sale.lineCount}
										</TableCell>
										<TableCell className="text-right">
											<Money value={sale.total} />
										</TableCell>
										<TableCell className="text-right">
											<Money value={sale.totalProfit} />
										</TableCell>
									</TableRow>
									{expanded ? (
										<TableRow>
											<TableCell />
											<TableCell colSpan={7} className="bg-muted/30">
												<SaleLines saleId={sale.id} />
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
