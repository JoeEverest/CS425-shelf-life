import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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

function startOfWeek(date: Date): Date {
	const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const mondayOffset = (local.getDay() + 6) % 7;
	local.setDate(local.getDate() - mondayOffset);
	return local;
}

function addDays(date: Date, amount: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + amount);
	return next;
}

function toISODate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function fromISODate(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day);
}

const weekLabelFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});
const dayHeadingFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "short",
	day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

type DayGroup = { key: string; date: Date; sales: SaleSummary[] };

function groupByDay(sales: SaleSummary[]): DayGroup[] {
	const groups = new Map<string, SaleSummary[]>();
	for (const sale of sales) {
		const key = toISODate(new Date(sale.soldAt));
		const bucket = groups.get(key);
		if (bucket) {
			bucket.push(sale);
		} else {
			groups.set(key, [sale]);
		}
	}
	return [...groups.entries()]
		.sort((left, right) => right[0].localeCompare(left[0]))
		.map(([key, daySales]) => ({
			key,
			date: fromISODate(key),
			sales: daySales,
		}));
}

function sumField(
	sales: SaleSummary[],
	field: "total" | "totalProfit",
): number {
	return sales.reduce((sum, sale) => sum + Number(sale[field]), 0);
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
	const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const weekEnd = addDays(weekStart, 7);
	const range = useMemo(
		() => ({ from: toISODate(weekStart), to: toISODate(weekEnd) }),
		[weekStart, weekEnd],
	);
	const sales = useSales(range);

	const isCurrentWeek =
		toISODate(weekStart) === toISODate(startOfWeek(new Date()));

	// Only stable state setters are used, so the handler needs no dependencies.
	const shiftWeek = useCallback((weeks: number) => {
		setExpandedId(null);
		setWeekStart((current) => addDays(current, weeks * 7));
	}, []);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}
			if (event.key === "ArrowLeft") {
				shiftWeek(-1);
			} else if (event.key === "ArrowRight") {
				shiftWeek(1);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shiftWeek]);

	const days = useMemo(() => groupByDay(sales.data ?? []), [sales.data]);
	const weekLabel = `${weekLabelFormat.format(weekStart)} – ${weekLabelFormat.format(
		addDays(weekStart, 6),
	)}, ${addDays(weekStart, 6).getFullYear()}`;

	const weekRevenue = sumField(sales.data ?? [], "total");
	const weekProfit = sumField(sales.data ?? [], "totalProfit");

	return (
		<div>
			<PageHeader
				title="Sales"
				description="Every sale, grouped by day. Expand a sale to see its items. Use the arrows or ← → keys to move between weeks."
			/>

			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => shiftWeek(-1)}
						aria-label="Previous week"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<div className="min-w-44 text-center">
						<p className="font-display font-semibold">{weekLabel}</p>
						{isCurrentWeek ? (
							<p className="text-xs text-muted-foreground">This week</p>
						) : null}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => shiftWeek(1)}
						disabled={isCurrentWeek}
						aria-label="Next week"
					>
						<ChevronRight className="size-4" />
					</Button>
					{isCurrentWeek ? null : (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setExpandedId(null);
								setWeekStart(startOfWeek(new Date()));
							}}
						>
							This week
						</Button>
					)}
				</div>
				<div className="flex gap-6 text-sm">
					<div>
						<span className="text-muted-foreground">Revenue </span>
						<span className="font-medium">
							<Money value={weekRevenue.toFixed(2)} />
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Profit </span>
						<span className="font-medium">
							<Money value={weekProfit.toFixed(2)} />
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Sales </span>
						<span className="font-medium tabular-nums">
							{sales.data?.length ?? 0}
						</span>
					</div>
				</div>
			</div>

			{sales.isError ? <ErrorNote message={sales.error.message} /> : null}

			{sales.data && days.length === 0 ? (
				<EmptyState
					title="No sales this week"
					hint="Nothing was sold in this week. Move to another week with the arrows, or record a sale on the Sell page."
				/>
			) : (
				<div className="space-y-8">
					{days.map((day) => (
						<section key={day.key} className="space-y-2">
							<div className="flex items-baseline justify-between border-b pb-2">
								<h2 className="font-display text-lg font-semibold">
									{dayHeadingFormat.format(day.date)}
								</h2>
								<p className="text-sm text-muted-foreground">
									{day.sales.length} {day.sales.length === 1 ? "sale" : "sales"}{" "}
									· <Money value={sumField(day.sales, "total").toFixed(2)} />
								</p>
							</div>
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
									{day.sales.map((sale) => {
										const expanded = expandedId === sale.id;
										return (
											<Fragment key={sale.id}>
												<TableRow
													className="cursor-pointer"
													onClick={() =>
														setExpandedId(expanded ? null : sale.id)
													}
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
															<span className="text-muted-foreground">
																Walk-in
															</span>
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
						</section>
					))}
				</div>
			)}
		</div>
	);
}
