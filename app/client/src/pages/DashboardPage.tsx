import { useDashboard } from "@/api/hooks";
import type { Dashboard } from "@/api/types";
import { Money, PageHeader } from "@/components/bits";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function Stat({
	label,
	children,
	hint,
}: {
	label: string;
	children: React.ReactNode;
	hint?: string;
}) {
	return (
		<div className="space-y-1">
			<p className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="font-display text-2xl font-semibold tabular-nums">
				{children}
			</p>
			{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

function TopProducts({ rows }: { rows: Dashboard["topProducts"] }) {
	const max = rows.reduce((m, r) => Math.max(m, Number(r.revenue)), 0);
	if (rows.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No sales in this period yet.
			</p>
		);
	}
	return (
		<div className="space-y-3">
			{rows.map((row) => {
				const width = max > 0 ? (Number(row.revenue) / max) * 100 : 0;
				return (
					<div key={row.productId} className="space-y-1">
						<div className="flex items-baseline justify-between gap-3 text-sm">
							<span className="truncate font-medium">{row.name}</span>
							<span className="shrink-0 tabular-nums">
								<Money value={row.revenue} />
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${Math.max(width, 2)}%` }}
							/>
						</div>
						<p className="text-xs text-muted-foreground tabular-nums">
							{row.unitsSold.toLocaleString()} sold · profit{" "}
							<Money value={row.profit} />
						</p>
					</div>
				);
			})}
		</div>
	);
}

export default function DashboardPage() {
	const dashboard = useDashboard();

	if (dashboard.isPending) {
		return (
			<div>
				<PageHeader title="Dashboard" />
				<p className="text-sm text-muted-foreground">Gathering the numbers…</p>
			</div>
		);
	}

	if (dashboard.isError) {
		return (
			<div>
				<PageHeader title="Dashboard" />
				<p className="text-sm text-destructive">{dashboard.error.message}</p>
			</div>
		);
	}

	const data = dashboard.data;

	return (
		<div className="space-y-10">
			<PageHeader
				title="Dashboard"
				description="Sales, profit, and what the store owes and is owed — over the last 30 days."
			/>

			<section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<Stat label="Sales" hint={`${data.salesCount} sales`}>
					<Money value={data.salesTotal} />
				</Stat>
				<Stat label="Profit" hint="after cost of goods">
					<Money value={data.salesProfit} />
				</Stat>
				<Stat label="Expenses">
					<Money value={data.expensesTotal} />
				</Stat>
				<Stat label="Net profit" hint="profit minus expenses">
					<Money value={data.netProfit} />
				</Stat>
			</section>

			<div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<section className="space-y-4">
					<h2 className="font-display text-lg font-semibold">
						Top products by revenue
					</h2>
					<TopProducts rows={data.topProducts} />
				</section>

				<section className="space-y-6">
					<div className="grid grid-cols-2 gap-6">
						<Stat
							label="Owed to suppliers"
							hint="outstanding purchase balances"
						>
							<Money value={data.supplierPayable} />
						</Stat>
						<Stat label="Owed by customers" hint="outstanding invoices">
							<Money value={data.customerReceivable} />
						</Stat>
					</div>
					<div>
						<h2 className="font-display text-lg font-semibold">Attention</h2>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Signal</TableHead>
									<TableHead className="text-right">Count</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell>Products running low</TableCell>
									<TableCell className="text-right tabular-nums">
										{data.lowStockCount}
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</section>
			</div>
		</div>
	);
}
