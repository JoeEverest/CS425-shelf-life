import { useMemo, useState } from "react";
import {
	useCreatePurchaseOrder,
	useMe,
	useProducts,
	usePurchaseOrder,
	usePurchaseOrders,
	useSuppliers,
} from "@/api/hooks";
import type { PurchaseOrderSummary } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
	Qty,
	SearchInput,
} from "@/components/bits";
import { ReceiveDialog } from "@/components/ReceiveDialog";
import { SortableHead } from "@/components/SortableHead";
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
import { compareValues, useSortState } from "@/hooks/use-sort";
import { can, PERMISSIONS } from "@/lib/access";
import { addDays, startOfDay } from "@/lib/dates";
import { mediumDate } from "@/lib/format";

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

type OrderSortKey = "supplier" | "placed" | "lines" | "value" | "status";
type OrderFilter = "all" | "open" | "partially_received" | "received";
type PlacedFilter = "any" | "7" | "30" | "90";

const PLACED_LABELS: Record<PlacedFilter, string> = {
	any: "Any date",
	"7": "Placed in last 7 days",
	"30": "Placed in last 30 days",
	"90": "Placed in last 90 days",
};

function orderValue(
	order: PurchaseOrderSummary,
	key: OrderSortKey,
): string | number {
	switch (key) {
		case "placed":
			return new Date(order.createdAt).getTime();
		case "lines":
			return order.lineCount;
		case "value":
			return Number(order.totalValue);
		case "status":
			return STATUS_LABELS[order.status];
		default:
			return order.supplierName;
	}
}

export default function PurchaseOrdersPage() {
	const me = useMe();
	const orders = usePurchaseOrders();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<OrderFilter>("all");
	const [placed, setPlaced] = useState<PlacedFilter>("any");
	const { sort, toggle } = useSortState<OrderSortKey>("placed", "desc");
	const roles = me.data?.roles ?? [];

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		const cutoff =
			placed === "any"
				? null
				: addDays(startOfDay(new Date()), -Number(placed)).getTime();
		const filtered = (orders.data ?? []).filter((order) => {
			if (status !== "all" && order.status !== status) {
				return false;
			}
			if (cutoff !== null && new Date(order.createdAt).getTime() < cutoff) {
				return false;
			}
			if (q === "") {
				return true;
			}
			return (
				order.supplierName.toLowerCase().includes(q) ||
				STATUS_LABELS[order.status].toLowerCase().includes(q)
			);
		});
		return filtered.sort((left, right) =>
			compareValues(
				orderValue(left, sort.key),
				orderValue(right, sort.key),
				sort.direction,
			),
		);
	}, [orders.data, query, status, placed, sort]);
	const canCreate = can(roles, PERMISSIONS.PURCHASE_ORDERS_CREATE);
	const canReceive = can(roles, PERMISSIONS.DELIVERIES_SIGN_OFF);
	const canConfirmDiscrepancy = can(
		roles,
		PERMISSIONS.DELIVERIES_CONFIRM_DISCREPANCY,
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
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<SearchInput
							value={query}
							onChange={setQuery}
							label="Search purchase orders"
							placeholder="Search by supplier or status…"
						/>
						<NativeSelect
							aria-label="Filter by status"
							value={status}
							onChange={(event) => setStatus(event.target.value as OrderFilter)}
						>
							<NativeSelectOption value="all">All statuses</NativeSelectOption>
							<NativeSelectOption value="open">Open</NativeSelectOption>
							<NativeSelectOption value="partially_received">
								Partly received
							</NativeSelectOption>
							<NativeSelectOption value="received">Received</NativeSelectOption>
						</NativeSelect>
						<NativeSelect
							aria-label="Filter by placed date"
							value={placed}
							onChange={(event) =>
								setPlaced(event.target.value as PlacedFilter)
							}
						>
							{(["any", "7", "30", "90"] as const).map((option) => (
								<NativeSelectOption key={option} value={option}>
									{PLACED_LABELS[option]}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<span className="ml-auto text-sm text-muted-foreground tabular-nums">
							{rows.length} of {orders.data?.length ?? 0}
						</span>
					</div>

					{rows.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							No purchase order matches this search.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead column="supplier" sort={sort} onSort={toggle}>
										Supplier
									</SortableHead>
									<SortableHead column="placed" sort={sort} onSort={toggle}>
										Placed
									</SortableHead>
									<SortableHead
										column="lines"
										sort={sort}
										onSort={toggle}
										className="text-right"
									>
										Lines
									</SortableHead>
									<SortableHead
										column="value"
										sort={sort}
										onSort={toggle}
										className="text-right"
									>
										Value
									</SortableHead>
									<SortableHead column="status" sort={sort} onSort={toggle}>
										Status
									</SortableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((order) => (
									<TableRow key={order.id}>
										<TableCell className="font-medium">
											{order.supplierName}
										</TableCell>
										<TableCell className="text-muted-foreground tabular-nums">
											{mediumDate.format(new Date(order.createdAt))}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{order.lineCount}
										</TableCell>
										<TableCell className="text-right">
											<Money value={order.totalValue} />
										</TableCell>
										<TableCell>{STATUS_LABELS[order.status]}</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												{canReceive && order.status !== "received" ? (
													<ReceiveDialog
														poId={order.id}
														canConfirmDiscrepancy={canConfirmDiscrepancy}
													/>
												) : null}
												<PoDetailDialog poId={order.id} label="View" />
											</div>
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
