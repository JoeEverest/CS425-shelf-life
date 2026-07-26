import { useState } from "react";
import { useAdjustStock, useMe, useStock, useStockAlerts } from "@/api/hooks";
import type { StockRow } from "@/api/types";
import { EmptyState, ErrorNote, PageHeader, Qty } from "@/components/bits";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can, PERMISSIONS } from "@/lib/access";

function AlertsTab() {
	const alerts = useStockAlerts();
	const rows = (alerts.data ?? []).filter((row) => row.hasHistory);
	const lowCount = rows.filter((row) => row.low).length;

	if (rows.length === 0) {
		return (
			<EmptyState
				title="No sales history yet"
				hint="Low-stock urgency is based on how fast each product actually sells. Once sales are recorded, at-risk products surface here."
			/>
		);
	}

	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				{lowCount === 0
					? "Nothing is running low right now."
					: `${lowCount} product${lowCount === 1 ? "" : "s"} running low, ranked by how soon they run out.`}
			</p>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Product</TableHead>
						<TableHead className="text-right">On hand</TableHead>
						<TableHead className="text-right">Sells / day</TableHead>
						<TableHead className="text-right">Days left</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow
							key={row.productId}
							className={row.low ? "font-medium" : undefined}
						>
							<TableCell>
								{row.name}
								{row.low ? (
									<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
										Low
									</span>
								) : null}
							</TableCell>
							<TableCell className="text-right">
								<Qty value={row.qtyUnits} unit={row.saleUnitName} />
							</TableCell>
							<TableCell className="text-right tabular-nums text-muted-foreground">
								{row.velocityPerDay}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{row.daysToStockout ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AdjustDialog({ row }: { row: StockRow }) {
	const [open, setOpen] = useState(false);
	const adjust = useAdjustStock();
	const [delta, setDelta] = useState("");
	const [note, setNote] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Adjust
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						Adjust — {row.name}
					</DialogTitle>
					<DialogDescription>
						Corrections are recorded as new ledger entries, never edits. The
						note explains why to the next reader.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						adjust.mutate(
							{ productId: row.productId, deltaUnits: Number(delta), note },
							{
								onSuccess: () => {
									setOpen(false);
									setDelta("");
									setNote("");
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="delta">
							Change in {row.saleUnitName}
						</FieldLabel>
						<Input
							id="delta"
							required
							type="number"
							step={1}
							className="tabular-nums"
							placeholder="-3 or 12"
							value={delta}
							onChange={(event) => setDelta(event.target.value)}
						/>
						<FieldDescription>
							On hand now: {row.qtyUnits.toLocaleString()} {row.saleUnitName}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="note">Reason</FieldLabel>
						<Input
							id="note"
							required
							minLength={3}
							placeholder="e.g. damaged in storage"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</Field>
					{adjust.isError ? <ErrorNote message={adjust.error.message} /> : null}
					<Button type="submit" disabled={adjust.isPending}>
						Record adjustment
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default function StockPage() {
	const me = useMe();
	const stock = useStock();
	const canAdjust = can(me.data?.roles ?? [], PERMISSIONS.INVENTORY_ADJUST);

	return (
		<div>
			<PageHeader
				title="Stock"
				description="Current sale-unit quantities, backed by the movement ledger."
			/>
			<Tabs defaultValue="levels">
				<TabsList>
					<TabsTrigger value="levels">Levels</TabsTrigger>
					<TabsTrigger value="alerts">Low-stock alerts</TabsTrigger>
				</TabsList>

				<TabsContent value="levels" className="pt-4">
					{stock.data && stock.data.length === 0 ? (
						<EmptyState
							title="Nothing in stock"
							hint="Stock arrives through signed-off deliveries; managers can also record opening balances as adjustments."
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>SKU</TableHead>
									<TableHead>Product</TableHead>
									<TableHead className="text-right">On hand</TableHead>
									{canAdjust ? <TableHead /> : null}
								</TableRow>
							</TableHeader>
							<TableBody>
								{(stock.data ?? []).map((row) => (
									<TableRow key={row.productId}>
										<TableCell className="font-medium tabular-nums">
											{row.sku}
										</TableCell>
										<TableCell>{row.name}</TableCell>
										<TableCell className="text-right">
											<Qty value={row.qtyUnits} unit={row.saleUnitName} />
										</TableCell>
										{canAdjust ? (
											<TableCell className="text-right">
												<AdjustDialog row={row} />
											</TableCell>
										) : null}
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</TabsContent>

				<TabsContent value="alerts" className="pt-4">
					<AlertsTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
