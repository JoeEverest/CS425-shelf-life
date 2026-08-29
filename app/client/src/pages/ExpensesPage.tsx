import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useCreateExpense, useDeleteExpense, useExpenses } from "@/api/hooks";
import type { Expense } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
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
import { Field, FieldLabel } from "@/components/ui/field";
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
import { compareValues, useSortState } from "@/hooks/use-sort";
import { addDays, startOfWeek, toISODate } from "@/lib/dates";
import { mediumDate } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
	rent: "Rent",
	transport: "Transport",
	delivery: "Delivery",
	salaries: "Salaries",
	utilities: "Utilities",
};

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function CreateExpenseDialog() {
	const [open, setOpen] = useState(false);
	const create = useCreateExpense();
	const [category, setCategory] = useState("rent");
	const [amount, setAmount] = useState("");
	const [incurredOn, setIncurredOn] = useState(today());
	const [note, setNote] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>Record expense</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Record expense</DialogTitle>
					<DialogDescription>
						Feeds the financial report and the net-profit line.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{
								category,
								amount,
								incurredOn,
								note: note.trim() === "" ? undefined : note,
							},
							{
								onSuccess: () => {
									setOpen(false);
									setAmount("");
									setNote("");
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="e-category">Category</FieldLabel>
						<NativeSelect
							id="e-category"
							value={category}
							onChange={(event) => setCategory(event.target.value)}
						>
							{Object.entries(CATEGORY_LABELS).map(([value, label]) => (
								<NativeSelectOption key={value} value={value}>
									{label}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</Field>
					<Field>
						<FieldLabel htmlFor="e-amount">Amount</FieldLabel>
						<Input
							id="e-amount"
							required
							inputMode="decimal"
							pattern="\d+\.\d{2}"
							placeholder="120.00"
							className="tabular-nums"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="e-date">Date</FieldLabel>
						<Input
							id="e-date"
							required
							type="date"
							className="tabular-nums"
							value={incurredOn}
							onChange={(event) => setIncurredOn(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="e-note">Note (optional)</FieldLabel>
						<Input
							id="e-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</Field>
					{create.isError ? <ErrorNote message={create.error.message} /> : null}
					<Button type="submit" disabled={create.isPending}>
						{create.isPending ? "Saving…" : "Save expense"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type ExpenseSortKey = "date" | "category" | "note" | "amount";

const weekLabelFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

function expenseValue(
	expense: Expense,
	key: ExpenseSortKey,
): string | number | null {
	switch (key) {
		case "category":
			return CATEGORY_LABELS[expense.category] ?? expense.category;
		case "note":
			return expense.note;
		case "amount":
			return Number(expense.amount);
		default:
			return expense.incurredOn;
	}
}

function sumAmounts(rows: Expense[]): number {
	return rows.reduce((total, expense) => total + Number(expense.amount), 0);
}

function inWeek(expense: Expense, from: string, to: string): boolean {
	return expense.incurredOn >= from && expense.incurredOn < to;
}

export default function ExpensesPage() {
	const expenses = useExpenses();
	const remove = useDeleteExpense();
	const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("all");
	const { sort, toggle } = useSortState<ExpenseSortKey>("date", "desc");

	const all = expenses.data ?? [];
	const thisWeekStart = startOfWeek(new Date());
	const isCurrentWeek = toISODate(weekStart) === toISODate(thisWeekStart);

	const from = toISODate(weekStart);
	const to = toISODate(addDays(weekStart, 7));
	const previousFrom = toISODate(addDays(weekStart, -7));

	const weekExpenses = useMemo(
		() => all.filter((expense) => inWeek(expense, from, to)),
		[all, from, to],
	);
	const previousExpenses = useMemo(
		() => all.filter((expense) => inWeek(expense, previousFrom, from)),
		[all, previousFrom, from],
	);

	const weekTotal = sumAmounts(weekExpenses);
	const previousTotal = sumAmounts(previousExpenses);
	const change =
		previousTotal === 0
			? null
			: ((weekTotal - previousTotal) / previousTotal) * 100;

	const byCategory = useMemo(() => {
		const totals = new Map<string, number>();
		for (const expense of weekExpenses) {
			totals.set(
				expense.category,
				(totals.get(expense.category) ?? 0) + Number(expense.amount),
			);
		}
		return [...totals.entries()]
			.map(([key, amount]) => ({ key, amount }))
			.sort((left, right) => right.amount - left.amount);
	}, [weekExpenses]);

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = weekExpenses.filter((expense) => {
			if (category !== "all" && expense.category !== category) {
				return false;
			}
			if (q === "") {
				return true;
			}
			const label = CATEGORY_LABELS[expense.category] ?? expense.category;
			return (
				label.toLowerCase().includes(q) ||
				(expense.note ?? "").toLowerCase().includes(q) ||
				expense.incurredOn.includes(q)
			);
		});
		return filtered.sort((left, right) =>
			compareValues(
				expenseValue(left, sort.key),
				expenseValue(right, sort.key),
				sort.direction,
			),
		);
	}, [weekExpenses, query, category, sort]);

	const weekLabel = `${weekLabelFormat.format(weekStart)} – ${weekLabelFormat.format(
		addDays(weekStart, 6),
	)}`;
	const biggest = byCategory[0];

	return (
		<div>
			<PageHeader
				title="Expenses"
				description="Operating costs — rent, transport, delivery, salaries, utilities. Shown one week at a time."
				action={<CreateExpenseDialog />}
			/>

			{all.length === 0 ? (
				<EmptyState
					title="No expenses recorded"
					hint="Record each operating cost with its date so reports and net profit stay honest."
					action={<CreateExpenseDialog />}
				/>
			) : (
				<div className="space-y-6">
					<section className="space-y-4 rounded-xl border bg-muted/20 p-5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									aria-label="Previous week"
									onClick={() =>
										setWeekStart((current) => addDays(current, -7))
									}
								>
									<ChevronLeft className="size-4" />
								</Button>
								<div className="min-w-40 text-center">
									<p className="font-display font-semibold">
										{weekLabel}, {addDays(weekStart, 6).getFullYear()}
									</p>
									{isCurrentWeek ? (
										<p className="text-xs text-muted-foreground">This week</p>
									) : null}
								</div>
								<Button
									variant="outline"
									size="sm"
									aria-label="Next week"
									disabled={isCurrentWeek}
									onClick={() => setWeekStart((current) => addDays(current, 7))}
								>
									<ChevronRight className="size-4" />
								</Button>
								{isCurrentWeek ? null : (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setWeekStart(thisWeekStart)}
									>
										This week
									</Button>
								)}
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl border bg-card px-4 py-3">
								<p className="text-xs text-muted-foreground">Spent this week</p>
								<p className="font-display text-xl font-semibold">
									<Money value={weekTotal.toFixed(2)} />
								</p>
								<p
									className={
										change === null
											? "text-xs text-muted-foreground"
											: change > 0
												? "text-xs text-destructive"
												: "text-xs text-primary"
									}
								>
									{change === null
										? "nothing spent last week"
										: `${change > 0 ? "+" : ""}${change.toFixed(0)}% vs last week`}
								</p>
							</div>
							<div className="rounded-xl border bg-card px-4 py-3">
								<p className="text-xs text-muted-foreground">Entries</p>
								<p className="font-display text-xl font-semibold tabular-nums">
									{weekExpenses.length}
								</p>
								<p className="text-xs text-muted-foreground">
									{previousExpenses.length} last week
								</p>
							</div>
							<div className="rounded-xl border bg-card px-4 py-3">
								<p className="text-xs text-muted-foreground">
									Biggest category
								</p>
								<p className="font-display text-xl font-semibold">
									{biggest
										? (CATEGORY_LABELS[biggest.key] ?? biggest.key)
										: "—"}
								</p>
								<p className="text-xs text-muted-foreground">
									{biggest ? (
										<Money value={biggest.amount.toFixed(2)} />
									) : (
										"no spending"
									)}
								</p>
							</div>
						</div>

						{byCategory.length > 0 ? (
							<div className="space-y-2">
								{byCategory.map((entry) => (
									<div key={entry.key} className="flex items-center gap-3">
										<span className="w-24 shrink-0 text-sm text-muted-foreground">
											{CATEGORY_LABELS[entry.key] ?? entry.key}
										</span>
										<span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
											<span
												className="block h-full rounded-full bg-primary"
												style={{
													width: `${weekTotal === 0 ? 0 : (entry.amount / weekTotal) * 100}%`,
												}}
											/>
										</span>
										<span className="w-24 shrink-0 text-right text-sm tabular-nums">
											<Money value={entry.amount.toFixed(2)} />
										</span>
									</div>
								))}
							</div>
						) : null}
					</section>

					<div className="flex flex-wrap items-center gap-3">
						<SearchInput
							value={query}
							onChange={setQuery}
							label="Search expenses"
							placeholder="Search by note, category or date…"
						/>
						<NativeSelect
							aria-label="Filter by category"
							value={category}
							onChange={(event) => setCategory(event.target.value)}
						>
							<NativeSelectOption value="all">
								All categories
							</NativeSelectOption>
							{Object.entries(CATEGORY_LABELS).map(([value, label]) => (
								<NativeSelectOption key={value} value={value}>
									{label}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<span className="ml-auto text-sm text-muted-foreground tabular-nums">
							{rows.length} of {weekExpenses.length} this week
						</span>
					</div>

					{rows.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							{weekExpenses.length === 0
								? "No expense was recorded in this week."
								: "No expense in this week matches the search."}
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead column="date" sort={sort} onSort={toggle}>
										Date
									</SortableHead>
									<SortableHead column="category" sort={sort} onSort={toggle}>
										Category
									</SortableHead>
									<SortableHead column="note" sort={sort} onSort={toggle}>
										Note
									</SortableHead>
									<SortableHead
										column="amount"
										sort={sort}
										onSort={toggle}
										className="text-right"
									>
										Amount
									</SortableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((expense) => (
									<TableRow key={expense.id}>
										<TableCell className="tabular-nums">
											{mediumDate.format(
												new Date(`${expense.incurredOn}T00:00`),
											)}
										</TableCell>
										<TableCell>
											{CATEGORY_LABELS[expense.category] ?? expense.category}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{expense.note ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Money value={expense.amount} />
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												disabled={remove.isPending}
												onClick={() => remove.mutate(expense.id)}
											>
												Delete
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			)}
		</div>
	);
}
