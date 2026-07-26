import { useState } from "react";
import { useFinancialReport } from "@/api/hooks";
import { Money, PageHeader } from "@/components/bits";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function monthStart(): string {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function tomorrow(): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

const CATEGORY_LABELS: Record<string, string> = {
	rent: "Rent",
	transport: "Transport",
	delivery: "Delivery",
	salaries: "Salaries",
	utilities: "Utilities",
};

export default function ReportsPage() {
	const [from, setFrom] = useState(monthStart());
	const [to, setTo] = useState(tomorrow());
	const report = useFinancialReport(from, to);

	return (
		<div>
			<PageHeader
				title="Financial report"
				description="Revenue, cost of goods, expenses, and profit for a period. From is inclusive; to is exclusive."
			/>

			<div className="flex flex-wrap items-end gap-4 pb-8">
				<Field className="w-44">
					<FieldLabel htmlFor="r-from">From</FieldLabel>
					<Input
						id="r-from"
						type="date"
						className="tabular-nums"
						value={from}
						onChange={(event) => setFrom(event.target.value)}
					/>
				</Field>
				<Field className="w-44">
					<FieldLabel htmlFor="r-to">To</FieldLabel>
					<Input
						id="r-to"
						type="date"
						className="tabular-nums"
						value={to}
						onChange={(event) => setTo(event.target.value)}
					/>
				</Field>
			</div>

			{report.isError ? (
				<p className="text-sm text-destructive">{report.error.message}</p>
			) : null}

			{report.data ? (
				<div className="max-w-xl">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Line</TableHead>
								<TableHead className="text-right">Amount</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell>Revenue</TableCell>
								<TableCell className="text-right">
									<Money value={report.data.revenue} />
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell>Cost of goods sold</TableCell>
								<TableCell className="text-right">
									<Money value={report.data.cogs} />
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Gross profit</TableCell>
								<TableCell className="text-right font-medium">
									<Money value={report.data.grossProfit} />
								</TableCell>
							</TableRow>
							{Object.entries(report.data.expensesByCategory).map(
								([category, amount]) => (
									<TableRow key={category}>
										<TableCell className="pl-8 text-muted-foreground">
											{CATEGORY_LABELS[category] ?? category}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											<Money value={amount} />
										</TableCell>
									</TableRow>
								),
							)}
							<TableRow>
								<TableCell>Total expenses</TableCell>
								<TableCell className="text-right">
									<Money value={report.data.expensesTotal} />
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-display font-semibold">
									Net profit
								</TableCell>
								<TableCell className="text-right font-display font-semibold">
									<Money value={report.data.netProfit} />
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</div>
			) : report.isPending ? (
				<p className="text-sm text-muted-foreground">Reconciling…</p>
			) : null}
		</div>
	);
}
