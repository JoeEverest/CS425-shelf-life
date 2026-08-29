import { useMemo, useState } from "react";
import { useProjections } from "@/api/hooks";
import type { Projection } from "@/api/types";
import { EmptyState, PageHeader, Qty, SearchInput } from "@/components/bits";
import { SortableHead } from "@/components/SortableHead";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { compareValues, useSortState } from "@/hooks/use-sort";

type ProjectionSortKey = "name" | "qty" | "velocity" | "days";
type ProjectionFilter = "all" | "urgent" | "history" | "unknown";

const FILTER_LABELS: Record<ProjectionFilter, string> = {
	all: "All products",
	urgent: "Runs out within 7 days",
	history: "With sales history",
	unknown: "No sales history",
};

function runsOut(days: string | null): string {
	if (days === null) return "no sales data";
	const n = Number(days);
	if (n < 1) return "runs out today";
	return `~${days} days`;
}

function projectionValue(
	row: Projection,
	key: ProjectionSortKey,
): string | number | null {
	switch (key) {
		case "qty":
			return row.qtyUnits;
		case "velocity":
			return row.hasHistory ? Number(row.velocityPerDay) : null;
		case "days":
			return row.daysToStockout === null ? null : Number(row.daysToStockout);
		default:
			return row.name;
	}
}

function keepsFilter(row: Projection, filter: ProjectionFilter): boolean {
	switch (filter) {
		case "urgent":
			return row.daysToStockout !== null && Number(row.daysToStockout) <= 7;
		case "history":
			return row.hasHistory;
		case "unknown":
			return !row.hasHistory;
		default:
			return true;
	}
}

export default function ProjectionsPage() {
	const projections = useProjections();
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ProjectionFilter>("all");
	const { sort, toggle } = useSortState<ProjectionSortKey>("days");

	const all = projections.data ?? [];
	const withHistory = all.filter((row) => row.hasHistory);

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = all.filter((row) => {
			if (!keepsFilter(row, filter)) {
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
				projectionValue(left, sort.key),
				projectionValue(right, sort.key),
				sort.direction,
			),
		);
	}, [all, query, filter, sort]);

	return (
		<div>
			<PageHeader
				title="Stock projections"
				description="A simple estimate of when each product runs out, from its recent sales rate. Not a forecast — just the runway."
			/>

			{all.length === 0 ? (
				<EmptyState
					title="Nothing to project yet"
					hint="Projections need products and some sales history. Once the counter is busy, each product's runway shows here."
				/>
			) : (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<SearchInput
							value={query}
							onChange={setQuery}
							label="Search projections"
							placeholder="Search by name or SKU…"
						/>
						<NativeSelect
							aria-label="Filter projections"
							value={filter}
							onChange={(event) =>
								setFilter(event.target.value as ProjectionFilter)
							}
						>
							{(["all", "urgent", "history", "unknown"] as const).map(
								(option) => (
									<NativeSelectOption key={option} value={option}>
										{FILTER_LABELS[option]}
									</NativeSelectOption>
								),
							)}
						</NativeSelect>
						<span className="ml-auto text-sm text-muted-foreground tabular-nums">
							{rows.length} of {all.length}
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
									<SortableHead
										column="velocity"
										sort={sort}
										onSort={toggle}
										className="text-right"
									>
										Sells / day
									</SortableHead>
									<SortableHead
										column="days"
										sort={sort}
										onSort={toggle}
										className="text-right"
									>
										Runs out in
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow
										key={row.productId}
										className={
											row.hasHistory ? undefined : "text-muted-foreground"
										}
									>
										<TableCell className="font-medium">{row.name}</TableCell>
										<TableCell className="text-right">
											<Qty value={row.qtyUnits} unit={row.saleUnitName} />
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{row.hasHistory ? row.velocityPerDay : "—"}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{runsOut(row.daysToStockout)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			)}

			{all.length > 0 && withHistory.length === 0 ? (
				<p className="pt-4 text-sm text-muted-foreground">
					No product has enough sales history yet to project a runway.
				</p>
			) : null}
		</div>
	);
}
