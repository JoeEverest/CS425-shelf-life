import { useProjections } from "@/api/hooks";
import { EmptyState, PageHeader, Qty } from "@/components/bits";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function runsOut(days: string | null): string {
	if (days === null) return "no sales data";
	const n = Number(days);
	if (n < 1) return "runs out today";
	return `~${days} days`;
}

export default function ProjectionsPage() {
	const projections = useProjections();
	const rows = projections.data ?? [];
	const withHistory = rows.filter((row) => row.hasHistory);

	return (
		<div>
			<PageHeader
				title="Stock projections"
				description="A simple estimate of when each product runs out, from its recent sales rate. Not a forecast — just the runway."
			/>

			{rows.length === 0 ? (
				<EmptyState
					title="Nothing to project yet"
					hint="Projections need products and some sales history. Once the counter is busy, each product's runway shows here."
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Product</TableHead>
							<TableHead className="text-right">On hand</TableHead>
							<TableHead className="text-right">Sells / day</TableHead>
							<TableHead className="text-right">Runs out in</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow
								key={row.productId}
								className={row.hasHistory ? undefined : "text-muted-foreground"}
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

			{rows.length > 0 && withHistory.length === 0 ? (
				<p className="pt-4 text-sm text-muted-foreground">
					No product has enough sales history yet to project a runway.
				</p>
			) : null}
		</div>
	);
}
