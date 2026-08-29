import { useMemo, useState } from "react";
import { useAdjustStock, useMe, useStock, useStockAlerts } from "@/api/hooks";
import type { StockRow } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
	PageHeader,
	Qty,
	SearchInput,
} from "@/components/bits";
import { SortableHead } from "@/components/SortableHead";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compareValues, useSortState } from "@/hooks/use-sort";
import { can, PERMISSIONS } from "@/lib/access";

function AlertsTab() {
	const alerts = useStockAlerts();
	const rows = (alerts.data ?? []).filter((row) => row.hasHistory);
	const lowCount = rows.filter((row) => row.low).length;

	if (rows.length === 0) {
		return (
			<EmptyState
				title="No sales history yet"
				hint="Low-stock urgency is based on how fast each product actually sells. Once sales are recorded, at-risk products surface here."
			/>
		);
	}

	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				{lowCount === 0
					? "Nothing is running low right now."
					: `${lowCount} product${lowCount === 1 ? "" : "s"} running low, ranked by how soon they run out.`}
			</p>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Product</TableHead>
						<TableHead className="text-right">On hand</TableHead>
						<TableHead className="text-right">Sells / day</TableHead>
						<TableHead className="text-right">Days left</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow
							key={row.productId}
							className={row.low ? "font-medium" : undefined}
						>
							<TableCell>
								{row.name}
								{row.low ? (
									<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
										Low
									</span>
								) : null}
							</TableCell>
							<TableCell className="text-right">
								<Qty value={row.qtyUnits} unit={row.saleUnitName} />
							</TableCell>
							<TableCell className="text-right tabular-nums text-muted-foreground">
								{row.velocityPerDay}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{row.daysToStockout ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AdjustDialog({ row }: { row: StockRow }) {
	const [open, setOpen] = useState(false);
	const adjust = useAdjustStock();
	const [delta, setDelta] = useState("");
	const [note, setNote] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Adjust
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						Adjust — {row.name}
					</DialogTitle>
					<DialogDescription>
						Corrections are recorded as new ledger entries, never edits. The
						note explains why to the next reader.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						adjust.mutate(
							{ productId: row.productId, deltaUnits: Number(delta), note },
							{
								onSuccess: () => {
									setOpen(false);
									setDelta("");
									setNote("");
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="delta">
							Change in {row.saleUnitName}
						</FieldLabel>
						<Input
							id="delta"
							required
							type="number"
							step={1}
							className="tabular-nums"
							placeholder="-3 or 12"
							value={delta}
							onChange={(event) => setDelta(event.target.value)}
						/>
						<FieldDescription>
							On hand now: {row.qtyUnits.toLocaleString()} {row.saleUnitName}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="note">Reason</FieldLabel>
						<Input
							id="note"
							required
							minLength={3}
							placeholder="e.g. damaged in storage"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</Field>
					{adjust.isError ? <ErrorNote message={adjust.error.message} /> : null}
					<Button type="submit" disabled={adjust.isPending}>
						Record adjustment
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type StockSortKey = "sku" | "name" | "qty";
type StockFilter = "all" | "in" | "low" | "out";

const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
	all: "All products",
	in: "In stock",
	low: "Running low",
	out: "Out of stock",
};

function stockValue(row: StockRow, key: StockSortKey): string | number {
	switch (key) {
		case "sku":
			return row.sku;
		case "qty":
			return row.qtyUnits;
		default:
			return row.name;
	}
}

export default function StockPage() {
	const me = useMe();
	const stock = useStock();
	const alerts = useStockAlerts();
	const canAdjust = can(me.data?.roles ?? [], PERMISSIONS.INVENTORY_ADJUST);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<StockFilter>("all");
	const { sort, toggle } = useSortState<StockSortKey>("name");

	const lowProducts = useMemo(
		() =>
			new Set(
				(alerts.data ?? [])
					.filter((row) => row.low)
					.map((row) => row.productId),
			),
		[alerts.data],
	);

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = (stock.data ?? []).filter((row) => {
			if (filter === "in" && row.qtyUnits <= 0) {
				return false;
			}
			if (filter === "out" && row.qtyUnits > 0) {
				return false;
			}
			if (filter === "low" && !lowProducts.has(row.productId)) {
				return false;
			}
			if (q === "") {
				return true;
			}
			return (
				row.name.toLowerCase().includes(q) || row.sku.toLowerCase().includes(q)
			);
		});
		return filtered.sort((left, right) =>
			compareValues(
				stockValue(left, sort.key),
				stockValue(right, sort.key),
				sort.direction,
			),
		);
	}, [stock.data, query, filter, lowProducts, sort]);

	return (
		<div>
			<PageHeader
				title="Stock"
				description="Current sale-unit quantities, backed by the movement ledger."
			/>
			<Tabs defaultValue="levels">
				<TabsList>
					<TabsTrigger value="levels">Levels</TabsTrigger>
					<TabsTrigger value="alerts">Low-stock alerts</TabsTrigger>
				</TabsList>

				<TabsContent value="levels" className="pt-4">
					{stock.data && stock.data.length === 0 ? (
						<EmptyState
							title="Nothing in stock"
							hint="Stock arrives through signed-off deliveries; managers can also record opening balances as adjustments."
						/>
					) : (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center gap-3">
								<SearchInput
									value={query}
									onChange={setQuery}
									label="Search stock"
									placeholder="Search by name or SKU…"
								/>
								<NativeSelect
									aria-label="Filter stock"
									value={filter}
									onChange={(event) =>
										setFilter(event.target.value as StockFilter)
									}
								>
									{(["all", "in", "low", "out"] as const).map((option) => (
										<NativeSelectOption key={option} value={option}>
											{STOCK_FILTER_LABELS[option]}
										</NativeSelectOption>
									))}
								</NativeSelect>
								<span className="ml-auto text-sm text-muted-foreground tabular-nums">
									{rows.length} of {stock.data?.length ?? 0}
								</span>
							</div>
							{rows.length === 0 ? (
								<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
									No product matches this search.
								</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<SortableHead column="sku" sort={sort} onSort={toggle}>
												SKU
											</SortableHead>
											<SortableHead column="name" sort={sort} onSort={toggle}>
												Product
											</SortableHead>
											<SortableHead
												column="qty"
												sort={sort}
												onSort={toggle}
												className="text-right"
											>
												On hand
											</SortableHead>
											{canAdjust ? <TableHead /> : null}
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((row) => (
											<TableRow key={row.productId}>
												<TableCell className="font-medium tabular-nums">
													{row.sku}
												</TableCell>
												<TableCell>
													{row.name}
													{lowProducts.has(row.productId) ? (
														<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
															Low
														</span>
													) : null}
												</TableCell>
												<TableCell className="text-right">
													<Qty value={row.qtyUnits} unit={row.saleUnitName} />
												</TableCell>
												{canAdjust ? (
													<TableCell className="text-right">
														<AdjustDialog row={row} />
													</TableCell>
												) : null}
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</div>
					)}
				</TabsContent>

				<TabsContent value="alerts" className="pt-4">
					<AlertsTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
