import { useMemo, useState } from "react";
import {
	useCreatePurchaseOrder,
	useMe,
	useProducts,
	usePurchaseOrder,
	usePurchaseOrders,
	useSuppliers,
} from "@/api/hooks";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
	Qty,
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
import { can, PERMISSIONS } from "@/lib/access";

const STATUS_LABELS = {
	open: "Open",
	partially_received: "Partially received",
	received: "Received",
} as const;

type DraftLine = { productId: string; qtyBulk: string };

function CreatePoDialog() {
	const [open, setOpen] = useState(false);
	const suppliers = useSuppliers();
	const products = useProducts();
	const create = useCreatePurchaseOrder();
	const [supplierId, setSupplierId] = useState("");
	const [lines, setLines] = useState<DraftLine[]>([
		{ productId: "", qtyBulk: "" },
	]);

	const productById = useMemo(
		() =>
			new Map((products.data ?? []).map((product) => [product.id, product])),
		[products.data],
	);

	const orderTotal = lines.reduce((total, line) => {
		const product = productById.get(line.productId);
		const qty = Number(line.qtyBulk);
		if (!product || !Number.isFinite(qty)) {
			return total;
		}
		return total + Number(product.bulkCost) * qty;
	}, 0);

	const setLine = (index: number, patch: Partial<DraftLine>) =>
		setLines((current) =>
			current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
		);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>New purchase order</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="font-display">New purchase order</DialogTitle>
					<DialogDescription>
						Quantities are in each product's bulk unit; today's bulk cost is
						locked into the order.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{
								supplierId,
								lines: lines
									.filter(
										(line) => line.productId !== "" && line.qtyBulk !== "",
									)
									.map((line) => ({
										productId: line.productId,
										qtyBulk: Number(line.qtyBulk),
									})),
							},
							{
								onSuccess: () => {
									setOpen(false);
									setSupplierId("");
									setLines([{ productId: "", qtyBulk: "" }]);
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="po-supplier">Supplier</FieldLabel>
						<NativeSelect
							id="po-supplier"
							required
							value={supplierId}
							onChange={(event) => setSupplierId(event.target.value)}
						>
							<NativeSelectOption value="">
								Choose a supplier…
							</NativeSelectOption>
							{(suppliers.data ?? []).map((supplier) => (
								<NativeSelectOption key={supplier.id} value={supplier.id}>
									{supplier.name}
								</NativeSelectOption>
							))}
						</NativeSelect>
					</Field>

					<div className="space-y-2">
						{lines.map((line, index) => {
							const product = productById.get(line.productId);
							return (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no identity
									key={index}
									className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-end gap-2"
								>
									<Field>
										{index === 0 ? (
											<FieldLabel htmlFor={`po-product-${index}`}>
												Product
											</FieldLabel>
										) : null}
										<NativeSelect
											id={`po-product-${index}`}
											value={line.productId}
											onChange={(event) =>
												setLine(index, { productId: event.target.value })
											}
										>
											<NativeSelectOption value="">
												Choose a product…
											</NativeSelectOption>
											{(products.data ?? []).map((candidate) => (
												<NativeSelectOption
													key={candidate.id}
													value={candidate.id}
												>
													{candidate.name} ({candidate.bulkUnitName} of{" "}
													{candidate.unitsPerBulk})
												</NativeSelectOption>
											))}
										</NativeSelect>
									</Field>
									<Field>
										{index === 0 ? (
											<FieldLabel htmlFor={`po-qty-${index}`}>
												{product ? `${product.bulkUnitName}s` : "Qty"}
											</FieldLabel>
										) : null}
										<Input
											id={`po-qty-${index}`}
											type="number"
											min={1}
											step={1}
											className="tabular-nums"
											value={line.qtyBulk}
											onChange={(event) =>
												setLine(index, { qtyBulk: event.target.value })
											}
										/>
									</Field>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={lines.length === 1}
										onClick={() =>
											setLines((current) =>
												current.filter((_, i) => i !== index),
											)
										}
									>
										Remove
									</Button>
								</div>
							);
						})}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								setLines((current) => [
									...current,
									{ productId: "", qtyBulk: "" },
								])
							}
						>
							Add line
						</Button>
					</div>

					<div className="flex items-center justify-between border-t pt-4">
						<p className="text-sm text-muted-foreground">
							Estimated total: <Money value={orderTotal.toFixed(2)} />
						</p>
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? "Submitting…" : "Submit order"}
						</Button>
					</div>
					{create.isError ? <ErrorNote message={create.error.message} /> : null}
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PoDetailDialog({ poId, label }: { poId: string; label: string }) {
	const [open, setOpen] = useState(false);
	const detail = usePurchaseOrder(open ? poId : null);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					{label}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle className="font-display">
						{detail.data
							? `${detail.data.supplierName} — ${STATUS_LABELS[detail.data.status]}`
							: "Purchase order"}
					</DialogTitle>
					<DialogDescription>
						Costs shown are the bulk costs locked at order time.
					</DialogDescription>
				</DialogHeader>
				{detail.data ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Product</TableHead>
								<TableHead className="text-right">Ordered</TableHead>
								<TableHead className="text-right">Bulk cost</TableHead>
								<TableHead className="text-right">Line total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{detail.data.lines.map((line) => (
								<TableRow key={line.id}>
									<TableCell>
										{line.productName}
										<span className="ml-2 text-xs text-muted-foreground tabular-nums">
											{line.sku}
										</span>
									</TableCell>
									<TableCell className="text-right">
										<Qty value={line.qtyBulk} unit={line.bulkUnitName} />
									</TableCell>
									<TableCell className="text-right">
										<Money value={line.bulkCostAtOrder} />
									</TableCell>
									<TableCell className="text-right">
										<Money
											value={(
												Number(line.bulkCostAtOrder) * line.qtyBulk
											).toFixed(2)}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<p className="text-sm text-muted-foreground">Loading…</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

export default function PurchaseOrdersPage() {
	const me = useMe();
	const orders = usePurchaseOrders();
	const canCreate = can(
		me.data?.roles ?? [],
		PERMISSIONS.PURCHASE_ORDERS_CREATE,
	);

	return (
		<div>
			<PageHeader
				title="Purchase orders"
				description="Restocking requests to suppliers, in bulk units. Stock only changes at delivery sign-off."
				action={canCreate ? <CreatePoDialog /> : undefined}
			/>

			{orders.data && orders.data.length === 0 ? (
				<EmptyState
					title="No purchase orders"
					hint="When stock runs low, a manager raises an order here; the stockroom receives against it."
					action={canCreate ? <CreatePoDialog /> : undefined}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Supplier</TableHead>
							<TableHead>Placed</TableHead>
							<TableHead className="text-right">Lines</TableHead>
							<TableHead className="text-right">Value</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(orders.data ?? []).map((order) => (
							<TableRow key={order.id}>
								<TableCell className="font-medium">
									{order.supplierName}
								</TableCell>
								<TableCell className="text-muted-foreground tabular-nums">
									{new Date(order.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{order.lineCount}
								</TableCell>
								<TableCell className="text-right">
									<Money value={order.totalValue} />
								</TableCell>
								<TableCell>{STATUS_LABELS[order.status]}</TableCell>
								<TableCell className="text-right">
									<PoDetailDialog poId={order.id} label="View" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
