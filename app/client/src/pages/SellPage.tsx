import { useMemo, useRef, useState } from "react";
import {
	useCreateCustomer,
	useCustomers,
	useMe,
	useProducts,
	useRecordSale,
} from "@/api/hooks";
import type { Product, SaleDetail } from "@/api/types";
import { ErrorNote, Money, PageHeader, Qty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { can, PERMISSIONS } from "@/lib/access";

type CartLine = { product: Product; qty: number };
type Tender = "cash" | "credit";

function sellable(product: Product): boolean {
	return product.published && !product.archived && product.price !== null;
}

export default function SellPage() {
	const me = useMe();
	const products = useProducts();
	const customers = useCustomers();
	const createCustomer = useCreateCustomer();
	const record = useRecordSale();
	const [query, setQuery] = useState("");
	const [cart, setCart] = useState<CartLine[]>([]);
	const [receipt, setReceipt] = useState<SaleDetail | null>(null);
	const [tender, setTender] = useState<Tender>("cash");
	const [customerId, setCustomerId] = useState("");
	const [newCustomer, setNewCustomer] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);

	const canCredit = can(me.data?.roles ?? [], PERMISSIONS.CUSTOMERS_MANAGE);

	const catalog = (products.data ?? []).filter(sellable);
	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q === "") return catalog.slice(0, 6);
		return catalog
			.filter(
				(p) =>
					p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
			)
			.slice(0, 6);
	}, [catalog, query]);

	const total = cart.reduce(
		(sum, line) => sum + Number(line.product.price) * line.qty,
		0,
	);

	function addToCart(product: Product) {
		setCart((current) => {
			const existing = current.find((line) => line.product.id === product.id);
			if (existing) {
				return current.map((line) =>
					line.product.id === product.id
						? { ...line, qty: line.qty + 1 }
						: line,
				);
			}
			return [...current, { product, qty: 1 }];
		});
		setQuery("");
		searchRef.current?.focus();
	}

	function setQty(productId: string, qty: number) {
		setCart((current) =>
			current
				.map((line) =>
					line.product.id === productId
						? { ...line, qty: Math.max(0, qty) }
						: line,
				)
				.filter((line) => line.qty > 0),
		);
	}

	function completeSale() {
		const lines = cart.map((line) => ({
			productId: line.product.id,
			qtyUnits: line.qty,
		}));
		const body =
			tender === "credit"
				? ({ type: "credit", customerId, lines } as const)
				: ({ type: "cash", lines } as const);
		record.mutate(body, {
			onSuccess: (sale) => {
				setReceipt(sale);
				setCart([]);
				setQuery("");
				setTender("cash");
				setCustomerId("");
			},
		});
	}

	const creditReady = tender === "cash" || customerId !== "";

	if (receipt) {
		return (
			<div>
				<PageHeader
					title="Sale complete"
					action={
						<Button
							onClick={() => {
								setReceipt(null);
								searchRef.current?.focus();
							}}
						>
							New sale
						</Button>
					}
				/>
				<div className="max-w-md space-y-4">
					<Table>
						<TableBody>
							{receipt.lines.map((line) => (
								<TableRow key={line.id}>
									<TableCell>{line.productName}</TableCell>
									<TableCell className="text-right tabular-nums">
										{line.qtyUnits} × <Money value={line.unitPriceAtSale} />
									</TableCell>
								</TableRow>
							))}
							<TableRow>
								<TableCell className="font-display font-semibold">
									Total
								</TableCell>
								<TableCell className="text-right font-display font-semibold">
									<Money value={receipt.total} />
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
					<p className="text-sm text-muted-foreground">
						Profit on this sale: <Money value={receipt.totalProfit} />
					</p>
				</div>
			</div>
		);
	}

	return (
		<div>
			<PageHeader
				title="Sell"
				description="Search a product, add it, adjust quantities, take payment."
			/>

			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-4">
					<Input
						ref={searchRef}
						autoFocus
						placeholder="Search by name or SKU…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && matches.length > 0) {
								event.preventDefault();
								addToCart(matches[0]);
							}
						}}
					/>
					<div className="grid gap-2 sm:grid-cols-2">
						{matches.map((product) => (
							<button
								key={product.id}
								type="button"
								onClick={() => addToCart(product)}
								className="flex flex-col items-start gap-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-accent/40"
							>
								<span className="font-medium">{product.name}</span>
								<span className="text-xs text-muted-foreground tabular-nums">
									{product.sku} · <Money value={product.price} /> /{" "}
									{product.saleUnitName}
								</span>
								<span className="text-xs text-muted-foreground">
									<Qty value={product.qtyUnits} unit={product.saleUnitName} />{" "}
									in stock
								</span>
							</button>
						))}
						{matches.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No sellable product matches “{query}”.
							</p>
						) : null}
					</div>
				</div>

				<aside className="space-y-4 rounded-xl border bg-card p-5">
					<h2 className="font-display text-lg font-semibold">Current sale</h2>
					{cart.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nothing added yet. Search on the left and press Enter to add the
							top match.
						</p>
					) : (
						<div className="space-y-3">
							{cart.map((line) => (
								<div
									key={line.product.id}
									className="flex items-center justify-between gap-2"
								>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{line.product.name}
										</p>
										<p className="text-xs text-muted-foreground">
											<Money value={line.product.price} /> each
										</p>
									</div>
									<Input
										type="number"
										min={1}
										max={line.product.qtyUnits}
										value={line.qty}
										onChange={(event) =>
											setQty(line.product.id, Number(event.target.value))
										}
										className="w-16 tabular-nums"
										aria-label={`Quantity for ${line.product.name}`}
									/>
								</div>
							))}
							<div className="flex items-center justify-between border-t pt-3">
								<span className="text-sm text-muted-foreground">Total</span>
								<span className="font-display text-lg font-semibold">
									<Money value={total.toFixed(2)} />
								</span>
							</div>
						</div>
					)}

					{canCredit ? (
						<div className="space-y-2 border-t pt-3">
							<div className="inline-flex rounded-md border p-0.5 text-sm">
								{(["cash", "credit"] as const).map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setTender(option)}
										className={
											tender === option
												? "rounded bg-primary px-3 py-1 text-primary-foreground"
												: "rounded px-3 py-1 text-muted-foreground"
										}
									>
										{option === "cash" ? "Cash" : "Credit"}
									</button>
								))}
							</div>
							{tender === "credit" ? (
								<div className="flex gap-2">
									<NativeSelect
										aria-label="Customer"
										value={customerId}
										onChange={(event) => setCustomerId(event.target.value)}
									>
										<NativeSelectOption value="">
											Choose customer…
										</NativeSelectOption>
										{(customers.data ?? []).map((customer) => (
											<NativeSelectOption key={customer.id} value={customer.id}>
												{customer.name}
											</NativeSelectOption>
										))}
									</NativeSelect>
									<Input
										aria-label="New customer name"
										placeholder="or new…"
										value={newCustomer}
										onChange={(event) => setNewCustomer(event.target.value)}
										className="max-w-28"
									/>
									<Button
										type="button"
										variant="outline"
										disabled={
											newCustomer.trim() === "" || createCustomer.isPending
										}
										onClick={() =>
											createCustomer.mutate(
												{ name: newCustomer.trim() },
												{
													onSuccess: (customer) => {
														setNewCustomer("");
														setCustomerId(customer.id);
													},
												},
											)
										}
									>
										Add
									</Button>
								</div>
							) : null}
						</div>
					) : null}

					{record.isError ? <ErrorNote message={record.error.message} /> : null}

					<Button
						className="w-full"
						disabled={cart.length === 0 || record.isPending || !creditReady}
						onClick={completeSale}
					>
						{record.isPending
							? "Recording…"
							: tender === "credit"
								? "Record credit sale"
								: "Take payment"}
					</Button>
				</aside>
			</div>
		</div>
	);
}
