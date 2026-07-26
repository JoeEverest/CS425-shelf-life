import { useState } from "react";
import { useCreateExpense, useDeleteExpense, useExpenses } from "@/api/hooks";
import { EmptyState, ErrorNote, Money, PageHeader } from "@/components/bits";
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

export default function ExpensesPage() {
	const expenses = useExpenses();
	const remove = useDeleteExpense();

	return (
		<div>
			<PageHeader
				title="Expenses"
				description="Operating costs — rent, transport, delivery, salaries, utilities."
				action={<CreateExpenseDialog />}
			/>

			{expenses.data && expenses.data.length === 0 ? (
				<EmptyState
					title="No expenses recorded"
					hint="Record each operating cost with its date so reports and net profit stay honest."
					action={<CreateExpenseDialog />}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Date</TableHead>
							<TableHead>Category</TableHead>
							<TableHead>Note</TableHead>
							<TableHead className="text-right">Amount</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(expenses.data ?? []).map((expense) => (
							<TableRow key={expense.id}>
								<TableCell className="tabular-nums">
									{expense.incurredOn}
								</TableCell>
								<TableCell>{CATEGORY_LABELS[expense.category]}</TableCell>
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
	);
}
