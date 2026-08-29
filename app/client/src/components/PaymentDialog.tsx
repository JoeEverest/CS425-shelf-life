import { useState } from "react";
import { useRecordPayment } from "@/api/hooks";
import type { Invoice } from "@/api/types";
import { ErrorNote, Money } from "@/components/bits";
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

export function PaymentDialog({ invoice }: { invoice: Invoice }) {
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
