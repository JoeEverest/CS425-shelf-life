import type { ReactNode } from "react";
import { useState } from "react";
import { useFinancialReport } from "@/api/hooks";
import type { FinancialReport } from "@/api/types";
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

function share(part: number, whole: number): string {
	if (whole === 0) {
		return "—";
	}
	return `${((part / whole) * 100).toFixed(1)}%`;
}

function Figure({
	label,
	value,
	note,
	tone,
}: {
	label: string;
	value: ReactNode;
	note: string;
	tone?: "kept" | "loss";
}) {
	return (
		<div className="bg-background py-4 sm:px-5 sm:first:pl-0">
			<dt className="text-xs tracking-wide text-muted-foreground uppercase">
				{label}
			</dt>
			<dd
				className={
					tone === "loss"
						? "font-display text-2xl font-semibold text-destructive tabular-nums"
						: tone === "kept"
							? "font-display text-2xl font-semibold text-ledger-kept tabular-nums"
							: "font-display text-2xl font-semibold tabular-nums"
				}
			>
				{value}
			</dd>
			<dd className="text-sm text-muted-foreground">{note}</dd>
		</div>
	);
}

function ReportCharts({ report }: { report: FinancialReport }) {
	const revenue = Number(report.revenue);
	const cogs = Number(report.cogs);
	const grossProfit = Number(report.grossProfit);
	const expenses = Number(report.expensesTotal);
	const net = Number(report.netProfit);

	// Scaled to whichever side is larger, so a loss still fits the bar.
	const base = Math.max(revenue, cogs + expenses, 1);

	const categories = Object.entries(report.expensesByCategory)
		.map(([key, amount]) => ({ key, amount: Number(amount) }))
		.sort((left, right) => right.amount - left.amount);
	const biggestCategory = categories[0]?.amount ?? 0;

	// Grey for stock that left, amber for money spent, green for what stayed.
	const segments = [
		{
			key: "cogs",
			label: "Cost of goods",
			amount: cogs,
			fill: "bg-ledger-cost",
		},
		{
			key: "expenses",
			label: "Expenses",
			amount: expenses,
			fill: "bg-ledger-spend",
		},
		{
			key: "net",
			label: net < 0 ? "Shortfall" : "Kept",
			amount: Math.abs(net),
			fill: net < 0 ? "bg-destructive" : "bg-ledger-kept",
		},
	];

	return (
		<div className="space-y-10 pb-10">
			<dl className="grid gap-px border-y bg-border sm:grid-cols-3">
				<Figure
					label="Revenue"
					value={<Money value={report.revenue} />}
					note={`${share(grossProfit, revenue)} kept as gross profit`}
				/>
				<Figure
					label="Gross profit"
					value={<Money value={report.grossProfit} />}
					note={`cost of goods took ${share(cogs, revenue)}`}
				/>
				<Figure
					label="Net profit"
					value={<Money value={report.netProfit} />}
					tone={net < 0 ? "loss" : "kept"}
					note={`expenses took ${share(expenses, revenue)} of revenue`}
				/>
			</dl>

			<section className="space-y-3">
				<h2 className="font-display text-sm font-semibold">
					Where the money went
				</h2>
				<div className="flex h-7 w-full gap-px overflow-hidden rounded-sm bg-muted">
					{segments.map((segment) =>
						segment.amount > 0 ? (
							<span
								key={segment.key}
								title={`${segment.label}: ${segment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
								style={{ width: `${(segment.amount / base) * 100}%` }}
								className={segment.fill}
							/>
						) : null,
					)}
				</div>
				<dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
					{segments.map((segment) => (
						<div key={segment.key} className="flex items-baseline gap-2">
							<span
								aria-hidden
								className={`size-2.5 translate-y-px rounded-xs ${segment.fill}`}
							/>
							<dt className="text-muted-foreground">{segment.label}</dt>
							<dd className="font-medium tabular-nums">
								<Money value={segment.amount.toFixed(2)} />
							</dd>
							<dd className="text-xs text-muted-foreground tabular-nums">
								{share(segment.amount, revenue)}
							</dd>
						</div>
					))}
				</dl>
				{net < 0 ? (
					<p className="text-sm text-destructive">
						Costs ran past revenue in this period.
					</p>
				) : null}
			</section>

			{categories.length > 0 ? (
				<section className="space-y-3">
					<h2 className="font-display text-sm font-semibold">
						Expenses by category
					</h2>
					<div className="space-y-2">
						{categories.map((entry) => (
							<div key={entry.key} className="flex items-center gap-4">
								<span className="w-28 shrink-0 text-sm text-muted-foreground">
									{CATEGORY_LABELS[entry.key] ?? entry.key}
								</span>
								<span className="h-1.5 flex-1 rounded-full bg-muted">
									<span
										className="block h-full rounded-full bg-ledger-spend"
										style={{
											width: `${biggestCategory === 0 ? 0 : (entry.amount / biggestCategory) * 100}%`,
										}}
									/>
								</span>
								<span className="w-28 shrink-0 text-right text-sm tabular-nums">
									<Money value={entry.amount.toFixed(2)} />
								</span>
							</div>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}

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

			{report.data ? <ReportCharts report={report.data} /> : null}

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
