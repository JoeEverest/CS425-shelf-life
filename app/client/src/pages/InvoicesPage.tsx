import { useMemo, useState } from "react";
import {
	useCustomers,
	useInvoices,
	useMe,
	useRecordPayment,
} from "@/api/hooks";
import type { Invoice } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
	SearchInput,
} from "@/components/bits";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { can, PERMISSIONS } from "@/lib/access";
import { matchesNameOrPhone } from "@/lib/search";

function PaymentDialog({ invoice }: { invoice: Invoice }) {
	const [open, setOpen] = useState(false);
	const pay = useRecordPayment();
	const [amount, setAmount] = useState(invoice.balance);

	function change(next: boolean) {
		setOpen(next);
		if (next) {
			setAmount(invoice.balance);
			pay.reset();
		}
	}

	return (
		<Dialog open={open} onOpenChange={change}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Record payment
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						Payment — {invoice.customerName}
					</DialogTitle>
					<DialogDescription>
						Outstanding on this invoice: <Money value={invoice.balance} />. A
						payment can't exceed the balance.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex items-end gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						pay.mutate(
							{ invoiceId: invoice.id, amount },
							{
								onSuccess: () => {
									setOpen(false);
								},
							},
						);
					}}
				>
					<Field className="flex-1">
						<FieldLabel htmlFor={`amount-${invoice.id}`}>Amount</FieldLabel>
						<Input
							id={`amount-${invoice.id}`}
							required
							autoFocus
							onFocus={(event) => event.currentTarget.select()}
							inputMode="decimal"
							pattern="\d+\.\d{2}"
							className="tabular-nums"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={pay.isPending}>
						Record
					</Button>
				</form>
				{pay.isError ? <ErrorNote message={pay.error.message} /> : null}
			</DialogContent>
		</Dialog>
	);
}

export default function InvoicesPage() {
	const me = useMe();
	const invoices = useInvoices();
	const [query, setQuery] = useState("");

	// Only roles that manage customers may read the phone numbers.
	const customers = useCustomers(
		can(me.data?.roles ?? [], PERMISSIONS.CUSTOMERS_MANAGE),
	);

	const phoneByCustomer = useMemo(
		() =>
			new Map(
				(customers.data ?? []).map((customer) => [customer.id, customer.phone]),
			),
		[customers.data],
	);

	const matches = useMemo(
		() =>
			(invoices.data ?? []).filter((invoice) =>
				matchesNameOrPhone(
					invoice.customerName,
					phoneByCustomer.get(invoice.customerId) ?? null,
					query,
				),
			),
		[invoices.data, phoneByCustomer, query],
	);

	const outstanding = (invoices.data ?? []).reduce(
		(sum, invoice) => sum + Number(invoice.balance),
		0,
	);

	return (
		<div>
			<PageHeader
				title="Invoices"
				description="Every credit sale raises an invoice; record payments against it here."
				action={
					invoices.data && invoices.data.length > 0 ? (
						<p className="text-sm text-muted-foreground">
							Outstanding across all invoices:{" "}
							<span className="font-medium text-foreground">
								<Money value={outstanding} />
							</span>
						</p>
					) : null
				}
			/>

			{invoices.data && invoices.data.length === 0 ? (
				<EmptyState
					title="No invoices yet"
					hint="Credit sales raise invoices; they'll show here with their outstanding balance."
				/>
			) : (
				<div className="space-y-4">
					<SearchInput
						value={query}
						onChange={setQuery}
						label="Search invoices"
						placeholder="Search by customer name or phone…"
					/>
					{matches.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							No invoice matches “{query}”.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Issued</TableHead>
									<TableHead>Customer</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableHead className="text-right">Balance</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{matches.map((invoice) => (
									<TableRow key={invoice.id}>
										<TableCell className="tabular-nums text-muted-foreground">
											{new Date(invoice.issuedAt).toLocaleDateString()}
										</TableCell>
										<TableCell>{invoice.customerName}</TableCell>
										<TableCell className="text-right">
											<Money value={invoice.total} />
										</TableCell>
										<TableCell className="text-right">
											<Money value={invoice.balance} />
										</TableCell>
										<TableCell className="text-right">
											{Number(invoice.balance) > 0 ? (
												<PaymentDialog invoice={invoice} />
											) : (
												<span className="text-xs text-muted-foreground">
													Paid
												</span>
											)}
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
