import { useMemo, useState } from "react";
import {
	type ReceiptPayment,
	usePurchaseOrder,
	useReceiveDelivery,
} from "@/api/hooks";
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

export function ReceiveDialog({
	poId,
	canConfirmDiscrepancy,
}: {
	poId: string;
	canConfirmDiscrepancy: boolean;
}) {
	const [open, setOpen] = useState(false);
	const detail = usePurchaseOrder(open ? poId : null);
	const receive = useReceiveDelivery();
	const [received, setReceived] = useState<Record<string, string>>({});
	const [paymentKind, setPaymentKind] =
		useState<ReceiptPayment["kind"]>("immediate");
	const [partialAmount, setPartialAmount] = useState("");
	const [note, setNote] = useState("");

	const lines = detail.data?.lines ?? [];

	// A line is a discrepancy when received differs from what's still expected.
	const receivedValue = useMemo(
		() =>
			lines.reduce((sum, line) => {
				const qty = Number(received[line.id] ?? "");
				return Number.isFinite(qty) && qty > 0
					? sum + Number(line.bulkCostAtOrder) * qty
					: sum;
			}, 0),
		[lines, received],
	);

	// A short delivery is a normal partial. A discrepancy is something the
	// receiver chooses to flag with a note — and only a manager may confirm it.
	const isPartial = lines.some((line) => {
		const remaining = line.remaining ?? line.qtyBulk;
		return Number(received[line.id] ?? "0") < remaining;
	});
	const flaggingDiscrepancy = note.trim() !== "";
	const blockedByDiscrepancy = flaggingDiscrepancy && !canConfirmDiscrepancy;

	function submit() {
		const payment: ReceiptPayment =
			paymentKind === "partial"
				? { kind: "partial", amount: partialAmount }
				: { kind: paymentKind };
		receive.mutate(
			{
				poId,
				lines: lines.map((line) => ({
					poLineId: line.id,
					qtyBulkReceived: Number(received[line.id] ?? "0"),
				})),
				payment,
				discrepancyNote: flaggingDiscrepancy ? note : undefined,
				discrepancyConfirmed: flaggingDiscrepancy ? true : undefined,
			},
			{
				onSuccess: () => {
					setOpen(false);
					setReceived({});
					setNote("");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Receive</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="font-display">
						Receive delivery
						{detail.data ? ` — ${detail.data.supplierName}` : ""}
					</DialogTitle>
					<DialogDescription>
						Enter what actually arrived, in bulk units. Stock changes only when
						you sign off.
					</DialogDescription>
				</DialogHeader>

				{detail.data ? (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Product</TableHead>
									<TableHead className="text-right">Expected</TableHead>
									<TableHead className="text-right">Received</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{lines.map((line) => {
									const remaining = line.remaining ?? line.qtyBulk;
									return (
										<TableRow key={line.id}>
											<TableCell>
												{line.productName}
												<span className="ml-2 text-xs text-muted-foreground">
													{line.bulkUnitName}s
												</span>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{remaining}
											</TableCell>
											<TableCell className="text-right">
												<Input
													type="number"
													min={0}
													max={remaining}
													value={received[line.id] ?? ""}
													placeholder={String(remaining)}
													onChange={(event) =>
														setReceived((current) => ({
															...current,
															[line.id]: event.target.value,
														}))
													}
													className="ml-auto w-20 tabular-nums"
													aria-label={`Received ${line.productName}`}
												/>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>

						<Field>
							<FieldLabel htmlFor="discrepancy">
								Flag a discrepancy (optional)
								{canConfirmDiscrepancy ? "" : " — needs a manager"}
							</FieldLabel>
							<Input
								id="discrepancy"
								placeholder="e.g. 2 cartons arrived damaged"
								value={note}
								onChange={(event) => setNote(event.target.value)}
							/>
						</Field>
						{isPartial && !flaggingDiscrepancy ? (
							<p className="text-sm text-muted-foreground">
								This is a partial delivery — the order stays open for the rest.
							</p>
						) : null}

						<div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
							<div className="flex items-end gap-3">
								<Field className="w-40">
									<FieldLabel htmlFor="payment">Payment</FieldLabel>
									<NativeSelect
										id="payment"
										value={paymentKind}
										onChange={(event) =>
											setPaymentKind(
												event.target.value as ReceiptPayment["kind"],
											)
										}
									>
										<NativeSelectOption value="immediate">
											Pay now (full)
										</NativeSelectOption>
										<NativeSelectOption value="partial">
											Partial payment
										</NativeSelectOption>
										<NativeSelectOption value="deferred">
											Defer payment
										</NativeSelectOption>
									</NativeSelect>
								</Field>
								{paymentKind === "partial" ? (
									<Field className="w-32">
										<FieldLabel htmlFor="amount">Amount</FieldLabel>
										<Input
											id="amount"
											inputMode="decimal"
											pattern="\d+\.\d{2}"
											className="tabular-nums"
											value={partialAmount}
											onChange={(event) => setPartialAmount(event.target.value)}
										/>
									</Field>
								) : null}
							</div>
							<p className="text-sm text-muted-foreground">
								Received value: <Money value={receivedValue.toFixed(2)} />
							</p>
						</div>

						{receive.isError ? (
							<ErrorNote message={receive.error.message} />
						) : null}
						{blockedByDiscrepancy ? (
							<ErrorNote message="Only a manager can sign off a delivery flagged with a discrepancy." />
						) : null}

						<Button
							disabled={receive.isPending || blockedByDiscrepancy}
							onClick={submit}
						>
							{receive.isPending ? "Signing off…" : "Sign off delivery"}
						</Button>
					</>
				) : (
					<p className="text-sm text-muted-foreground">Loading order…</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
