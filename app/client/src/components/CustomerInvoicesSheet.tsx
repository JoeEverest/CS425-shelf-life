import { useCustomers, useInvoices } from "@/api/hooks";
import { Money } from "@/components/bits";
import { PaymentDialog } from "@/components/PaymentDialog";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { mediumDate } from "@/lib/format";

export function CustomerInvoicesSheet({
	customerId,
	onOpenChange,
}: {
	customerId: string | null;
	onOpenChange: (open: boolean) => void;
}) {
	const customers = useCustomers();
	const invoices = useInvoices();

	// Read the customer back from the list so the balance follows a payment.
	const customer =
		(customers.data ?? []).find((entry) => entry.id === customerId) ?? null;

	const theirs = (invoices.data ?? [])
		.filter((invoice) => invoice.customerId === customerId)
		.sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));

	const unpaid = theirs.filter((invoice) => Number(invoice.balance) > 0).length;

	return (
		<Sheet open={customerId !== null} onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-md">
				<SheetHeader className="pr-12">
					<SheetTitle className="font-display">{customer?.name}</SheetTitle>
					<SheetDescription>
						{customer?.phone ?? "No phone"} · owes{" "}
						<Money value={customer?.outstandingBalance ?? "0.00"} /> across{" "}
						{unpaid} open {unpaid === 1 ? "invoice" : "invoices"}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
					{theirs.length === 0 ? (
						<p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
							No invoices yet. Credit sales at the counter raise one.
						</p>
					) : (
						theirs.map((invoice) => {
							const open = Number(invoice.balance) > 0;
							return (
								<div
									key={invoice.id}
									className="space-y-3 rounded-lg border bg-card p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium">
												<Money value={invoice.total} />
											</p>
											<p className="text-xs text-muted-foreground">
												Issued {mediumDate.format(new Date(invoice.issuedAt))}
											</p>
										</div>
										<span
											className={
												open
													? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
													: "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{open ? "Outstanding" : "Paid"}
										</span>
									</div>
									{open ? (
										<div className="flex items-center justify-between gap-3 border-t pt-3">
											<span className="text-sm text-muted-foreground">
												Balance <Money value={invoice.balance} />
											</span>
											<PaymentDialog invoice={invoice} />
										</div>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
