import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useCreateCustomer, useCustomers } from "@/api/hooks";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
	SearchInput,
} from "@/components/bits";
import { CustomerInvoicesSheet } from "@/components/CustomerInvoicesSheet";
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
import { matchesNameOrPhone } from "@/lib/search";

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

export default function CustomersPage() {
	const customers = useCustomers();
	const [query, setQuery] = useState("");
	const [viewing, setViewing] = useState<string | null>(null);

	const matches = useMemo(
		() =>
			(customers.data ?? []).filter((customer) =>
				matchesNameOrPhone(customer.name, customer.phone, query),
			),
		[customers.data, query],
	);

	return (
		<div>
			<PageHeader
				title="Customers"
				description="Who buys on credit and what they owe. Open a customer to see their invoices and record a payment."
				action={<NewCustomerDialog />}
			/>

			{customers.data && customers.data.length === 0 ? (
				<EmptyState
					title="No customers yet"
					hint="Add a customer, or create one during a credit sale at the counter."
					action={<NewCustomerDialog />}
				/>
			) : (
				<div className="space-y-4">
					<SearchInput
						value={query}
						onChange={setQuery}
						label="Search customers"
						placeholder="Search by name or phone…"
					/>
					{matches.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							No customer matches “{query}”.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Phone</TableHead>
									<TableHead className="text-right">Owes</TableHead>
									<TableHead className="w-8" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{matches.map((customer) => (
									<TableRow
										key={customer.id}
										className="cursor-pointer"
										onClick={() => setViewing(customer.id)}
									>
										<TableCell className="font-medium">
											{customer.name}
										</TableCell>
										<TableCell className="tabular-nums text-muted-foreground">
											{customer.phone ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Money value={customer.outstandingBalance} />
										</TableCell>
										<TableCell>
											<ChevronRight
												aria-hidden
												className="size-4 text-muted-foreground"
											/>
											<span className="sr-only">
												Invoices for {customer.name}
											</span>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>
			)}

			<CustomerInvoicesSheet
				customerId={viewing}
				onOpenChange={(open) => {
					if (!open) {
						setViewing(null);
					}
				}}
			/>
		</div>
	);
}
