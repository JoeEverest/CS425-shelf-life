import { useMemo, useState } from "react";
import { useCustomers, useInvoices, useMe } from "@/api/hooks";
import { EmptyState, Money, PageHeader, SearchInput } from "@/components/bits";
import { PaymentDialog } from "@/components/PaymentDialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { can, PERMISSIONS } from "@/lib/access";
import { mediumDate } from "@/lib/format";
import { matchesNameOrPhone } from "@/lib/search";

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
											{mediumDate.format(new Date(invoice.issuedAt))}
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
