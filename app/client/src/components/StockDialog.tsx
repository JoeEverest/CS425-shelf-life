import { useState } from "react";
import { useAdjustStock } from "@/api/hooks";
import { ErrorNote, Qty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Direction = "add" | "remove";

const REASONS: Record<Direction, string[]> = {
	add: [
		"opening count",
		"recount — found more",
		"returned by customer",
		"supplier top-up outside a purchase order",
	],
	remove: [
		"damaged in storage",
		"expired",
		"recount — found fewer",
		"taken for shop use",
	],
};

export function StockDialog({
	productId,
	name,
	saleUnitName,
	qtyUnits,
	trigger,
}: {
	productId: string;
	name: string;
	saleUnitName: string;
	qtyUnits: number;
	trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const adjust = useAdjustStock();
	const [direction, setDirection] = useState<Direction>("add");
	const [amount, setAmount] = useState("");
	const [note, setNote] = useState("");

	const units = Number(amount);
	const valid = Number.isInteger(units) && units > 0;
	const delta = direction === "add" ? units : -units;
	const after = valid ? qtyUnits + delta : qtyUnits;
	const tooMany = direction === "remove" && valid && units > qtyUnits;

	function change(next: boolean) {
		setOpen(next);
		if (!next) {
			setDirection("add");
			setAmount("");
			setNote("");
			adjust.reset();
		}
	}

	return (
		<Dialog open={open} onOpenChange={change}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline" size="sm">
						Add stock
					</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Stock — {name}</DialogTitle>
					<DialogDescription>
						Goods bought from a supplier belong on a purchase order, received at
						delivery. Use this for counts, corrections and write-offs; the
						reason is recorded in the ledger.
					</DialogDescription>
				</DialogHeader>

				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						adjust.mutate(
							{ productId, deltaUnits: delta, note },
							{ onSuccess: () => change(false) },
						);
					}}
				>
					<div className="grid grid-cols-2 gap-1 rounded-full border p-1 text-sm">
						{(["add", "remove"] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setDirection(option)}
								className={
									direction === option
										? "rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground"
										: "rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
								}
							>
								{option === "add" ? "Add stock" : "Remove stock"}
							</button>
						))}
					</div>

					<Field>
						<FieldLabel htmlFor={`units-${productId}`}>
							{direction === "add" ? "Units to add" : "Units to remove"}
						</FieldLabel>
						<Input
							id={`units-${productId}`}
							required
							autoFocus
							type="number"
							min={1}
							step={1}
							inputMode="numeric"
							className="tabular-nums"
							placeholder={`in ${saleUnitName}`}
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
						/>
						<FieldDescription>
							On hand <Qty value={qtyUnits} unit={saleUnitName} />
							{valid && !tooMany ? (
								<>
									{" → "}
									<span className="font-medium text-foreground">
										<Qty value={after} unit={saleUnitName} />
									</span>
								</>
							) : null}
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel htmlFor={`note-${productId}`}>Reason</FieldLabel>
						<Input
							id={`note-${productId}`}
							required
							minLength={3}
							list={`reasons-${productId}-${direction}`}
							placeholder={
								direction === "add"
									? "e.g. opening count"
									: "e.g. damaged in storage"
							}
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
						<datalist id={`reasons-${productId}-${direction}`}>
							{REASONS[direction].map((reason) => (
								<option key={reason} value={reason} />
							))}
						</datalist>
					</Field>

					{tooMany ? (
						<ErrorNote
							message={`Only ${qtyUnits.toLocaleString()} ${saleUnitName} on hand.`}
						/>
					) : null}
					{adjust.isError ? <ErrorNote message={adjust.error.message} /> : null}

					<Button
						type="submit"
						disabled={
							!valid || tooMany || note.trim().length < 3 || adjust.isPending
						}
					>
						{adjust.isPending
							? "Recording…"
							: direction === "add"
								? "Add to stock"
								: "Remove from stock"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
