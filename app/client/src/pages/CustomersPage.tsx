import { useState } from "react";
import {
	useCreateCustomer,
	useCustomers,
	useInvoices,
	useRecordPayment,
} from "@/api/hooks";
import type { Invoice } from "@/api/types";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function NewCustomerDialog() {
	const [open, setOpen] = useState(false);
	const create = useCreateCustomer();
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>New customer</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">New customer</DialogTitle>
					<DialogDescription>
						Customers who buy on credit; their balance is tracked here.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{ name, phone: phone.trim() === "" ? undefined : phone },
							{
								onSuccess: () => {
									setOpen(false);
									setName("");
									setPhone("");
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="c-name">Name</FieldLabel>
						<Input
							id="c-name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="c-phone">Phone</FieldLabel>
						<Input
							id="c-phone"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
					</Field>
					{create.isError ? <ErrorNote message={create.error.message} /> : null}
					<Button type="submit" disabled={create.isPending}>
						Add customer
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PaymentDialog({ invoice }: { invoice: Invoice }) {
	const [open, setOpen] = useState(false);
	const pay = useRecordPayment();
	const [amount, setAmount] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
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
									setAmount("");
								},
							},
						);
					}}
				>
					<Field className="flex-1">
						<FieldLabel htmlFor="amount">Amount</FieldLabel>
						<Input
							id="amount"
							required
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

export default function CustomersPage() {
	const customers = useCustomers();
	const invoices = useInvoices();

	return (
		<div>
			<PageHeader
				title="Customers"
				description="Who buys on credit, what they owe, and payments against their invoices."
				action={<NewCustomerDialog />}
			/>

			<Tabs defaultValue="customers">
				<TabsList>
					<TabsTrigger value="customers">Customers</TabsTrigger>
					<TabsTrigger value="invoices">Invoices</TabsTrigger>
				</TabsList>

				<TabsContent value="customers" className="pt-4">
					{customers.data && customers.data.length === 0 ? (
						<EmptyState
							title="No customers yet"
							hint="Add a customer, or create one during a credit sale at the counter."
							action={<NewCustomerDialog />}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Phone</TableHead>
									<TableHead className="text-right">Owes</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(customers.data ?? []).map((customer) => (
									<TableRow key={customer.id}>
										<TableCell className="font-medium">
											{customer.name}
										</TableCell>
										<TableCell className="tabular-nums text-muted-foreground">
											{customer.phone ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Money value={customer.outstandingBalance} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</TabsContent>

				<TabsContent value="invoices" className="pt-4">
					{invoices.data && invoices.data.length === 0 ? (
						<EmptyState
							title="No invoices yet"
							hint="Credit sales raise invoices; they'll show here with their outstanding balance."
						/>
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
								{(invoices.data ?? []).map((invoice) => (
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
				</TabsContent>
			</Tabs>
		</div>
	);
}
