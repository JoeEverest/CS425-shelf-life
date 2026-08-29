import {
	Minus,
	Plus,
	Search,
	ShoppingCart,
	Trash2,
	UserPlus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
	useCreateCustomer,
	useCustomers,
	useMe,
	useProducts,
	useRecordSale,
} from "@/api/hooks";
import type { Customer, Product, SaleDetail } from "@/api/types";
import { ErrorNote, Money, Qty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { can, PERMISSIONS } from "@/lib/access";
import { matchesNameOrPhone } from "@/lib/search";

type CartLine = { product: Product; qty: number };
type Tender = "cash" | "credit";

const ALL_CATEGORIES = "__all__";

function sellable(product: Product): boolean {
	return product.published && !product.archived && product.price !== null;
}

function unitLabel(unit: string, qty: number): string {
	if (qty === 1 || !/[a-z]$/i.test(unit) || /s$/i.test(unit)) {
		return unit;
	}
	return `${unit}s`;
}

function customerLabel(customer: Customer): string {
	return customer.phone === null
		? customer.name
		: `${customer.name} · ${customer.phone}`;
}

function matchesCustomer(customer: Customer, query: string): boolean {
	return matchesNameOrPhone(customer.name, customer.phone, query);
}

function NewCustomerSheet({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (customer: Customer) => void;
}) {
	const create = useCreateCustomer();
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");

	function close(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setName("");
			setPhone("");
			create.reset();
		}
	}

	return (
		<Sheet open={open} onOpenChange={close}>
			<SheetContent>
				<SheetHeader className="pr-12">
					<SheetTitle className="font-display">New customer</SheetTitle>
					<SheetDescription>
						Credit sales are tracked against this customer until they pay.
					</SheetDescription>
				</SheetHeader>
				<form
					id="new-customer-form"
					className="flex-1 space-y-5 overflow-y-auto px-4 pt-1"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{
								name: name.trim(),
								phone: phone.trim() === "" ? undefined : phone.trim(),
							},
							{
								onSuccess: (customer) => {
									onCreated(customer);
									close(false);
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="sell-customer-name">Name</FieldLabel>
						<Input
							id="sell-customer-name"
							required
							autoFocus
							placeholder="Full name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="sell-customer-phone">Phone</FieldLabel>
						<Input
							id="sell-customer-phone"
							type="tel"
							placeholder="Optional"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
					</Field>
					{create.isError ? <ErrorNote message={create.error.message} /> : null}
				</form>
				<SheetFooter>
					<Button
						type="submit"
						form="new-customer-form"
						disabled={name.trim() === "" || create.isPending}
					>
						{create.isPending ? "Saving…" : "Add customer"}
					</Button>
					<Button type="button" variant="outline" onClick={() => close(false)}>
						Cancel
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default function SellPage() {
	const me = useMe();
	const products = useProducts();
	const customers = useCustomers();
	const record = useRecordSale();
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState(ALL_CATEGORIES);
	const [cart, setCart] = useState<CartLine[]>([]);
	const [receipt, setReceipt] = useState<SaleDetail | null>(null);
	const [tender, setTender] = useState<Tender>("cash");
	const [customer, setCustomer] = useState<Customer | null>(null);
	const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	const canCredit = can(me.data?.roles ?? [], PERMISSIONS.CUSTOMERS_MANAGE);

	const catalog = useMemo(
		() => (products.data ?? []).filter(sellable),
		[products.data],
	);

	const categories = useMemo(() => {
		const names = new Set<string>();
		for (const product of catalog) {
			names.add(product.categoryName);
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	}, [catalog]);

	const outOfStock = catalog.filter((product) => product.qtyUnits <= 0).length;

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		return catalog
			.filter((product) => {
				if (category !== ALL_CATEGORIES && product.categoryName !== category) {
					return false;
				}
				if (q === "") {
					return true;
				}
				return (
					product.name.toLowerCase().includes(q) ||
					product.sku.toLowerCase().includes(q)
				);
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [catalog, category, query]);

	const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);
	const total = cart.reduce(
		(sum, line) => sum + Number(line.product.price) * line.qty,
		0,
	);

	function addToCart(product: Product) {
		if (product.qtyUnits <= 0) {
			return;
		}
		setCart((current) => {
			const existing = current.find((line) => line.product.id === product.id);
			if (existing) {
				return current.map((line) =>
					line.product.id === product.id
						? { ...line, qty: Math.min(line.qty + 1, product.qtyUnits) }
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
						? {
								...line,
								qty: Math.max(0, Math.min(qty, line.product.qtyUnits)),
							}
						: line,
				)
				.filter((line) => line.qty > 0),
		);
	}

	function startNewSale() {
		setReceipt(null);
		searchRef.current?.focus();
	}

	function completeSale() {
		const lines = cart.map((line) => ({
			productId: line.product.id,
			qtyUnits: line.qty,
		}));
		const body =
			tender === "credit" && customer !== null
				? ({ type: "credit", customerId: customer.id, lines } as const)
				: ({ type: "cash", lines } as const);
		record.mutate(body, {
			onSuccess: (sale) => {
				setReceipt(sale);
				setCart([]);
				setQuery("");
				setTender("cash");
				setCustomer(null);
			},
		});
	}

	const creditReady = tender === "cash" || customer !== null;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
			<section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
				<div className="shrink-0 space-y-4 border-b bg-background/95 px-4 pt-5 pb-4 backdrop-blur md:px-6 lg:sticky lg:top-0 lg:z-10">
					<div className="flex flex-wrap items-center gap-3">
						<div className="relative min-w-0 flex-1">
							<Search
								aria-hidden
								className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								ref={searchRef}
								autoFocus
								placeholder="Search a product by name or SKU…"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && matches.length > 0) {
										event.preventDefault();
										addToCart(matches[0]);
									}
								}}
								className="h-11 rounded-lg pl-9"
							/>
						</div>
						{outOfStock > 0 ? (
							<p className="text-sm font-medium text-destructive">
								{outOfStock} {outOfStock === 1 ? "item is" : "items are"} out of
								stock
							</p>
						) : null}
					</div>

					{categories.length > 1 ? (
						<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
							{[ALL_CATEGORIES, ...categories].map((name) => (
								<button
									key={name}
									type="button"
									onClick={() => setCategory(name)}
									className={
										category === name
											? "shrink-0 rounded-full border border-primary bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
											: "shrink-0 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
									}
								>
									{name === ALL_CATEGORIES ? "All products" : name}
								</button>
							))}
						</div>
					) : null}
				</div>

				<div className="px-4 py-5 md:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
					<div className="flex items-baseline justify-between gap-4 pb-4">
						<h2 className="font-display text-lg font-semibold tracking-tight">
							{category === ALL_CATEGORIES ? "Choose a product" : category}
						</h2>
						<span className="text-sm text-muted-foreground">
							{matches.length} {matches.length === 1 ? "product" : "products"}
						</span>
					</div>

					{matches.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							{query.trim() === ""
								? "No sellable product in this category yet."
								: `No sellable product matches “${query}”.`}
						</p>
					) : (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
							{matches.map((product) => {
								const empty = product.qtyUnits <= 0;
								return (
									<button
										key={product.id}
										type="button"
										disabled={empty}
										onClick={() => addToCart(product)}
										className="flex h-full flex-col items-start gap-1 rounded-xl border bg-card px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md disabled:pointer-events-none disabled:opacity-55"
									>
										<span className="font-medium">{product.name}</span>
										<span className="truncate text-xs text-muted-foreground">
											{product.sku}
										</span>
										<span className="mt-auto pt-2 font-display text-base font-semibold whitespace-nowrap text-primary">
											<Money value={product.price} />
											<span className="ml-1 text-xs font-normal text-muted-foreground">
												/ {product.saleUnitName}
											</span>
										</span>
										{empty ? (
											<span className="text-xs font-medium text-destructive">
												Out of stock
											</span>
										) : (
											<span className="text-xs text-muted-foreground">
												<Qty
													value={product.qtyUnits}
													unit={unitLabel(
														product.saleUnitName,
														product.qtyUnits,
													)}
												/>{" "}
												in stock
											</span>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>
			</section>

			<aside className="flex shrink-0 flex-col border-t bg-card lg:h-full lg:w-96 lg:border-t-0 lg:border-l">
				{receipt ? (
					<>
						<div className="shrink-0 border-b px-5 py-4">
							<h2 className="font-display text-lg font-semibold">
								Sale complete
							</h2>
							<p className="text-sm text-muted-foreground">
								{receipt.type === "credit"
									? `On credit · ${receipt.customerName ?? "customer"}`
									: "Paid in cash"}
							</p>
						</div>
						<div className="px-5 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
							{receipt.lines.map((line) => (
								<div
									key={line.id}
									className="flex items-baseline justify-between gap-3 border-b py-2.5 last:border-0"
								>
									<span className="min-w-0 truncate text-sm">
										{line.productName}
									</span>
									<span className="shrink-0 text-sm text-muted-foreground tabular-nums">
										{line.qtyUnits} × <Money value={line.unitPriceAtSale} />
									</span>
								</div>
							))}
						</div>
						<div className="shrink-0 space-y-3 border-t px-5 py-4">
							<div className="flex items-baseline justify-between">
								<span className="text-sm text-muted-foreground">Total</span>
								<span className="font-display text-xl font-semibold">
									<Money value={receipt.total} />
								</span>
							</div>
							<p className="text-sm text-muted-foreground">
								Profit on this sale: <Money value={receipt.totalProfit} />
							</p>
							<Button className="h-12 w-full text-base" onClick={startNewSale}>
								New sale
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
							<div>
								<h2 className="font-display text-lg font-semibold">
									Current sale
								</h2>
								<p className="text-sm text-muted-foreground">
									{itemCount} {itemCount === 1 ? "item" : "items"}
								</p>
							</div>
							{cart.length > 0 ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setCart([])}
									className="text-muted-foreground"
								>
									Clear
								</Button>
							) : null}
						</div>

						<div className="px-5 py-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
							{cart.length === 0 ? (
								<div className="flex flex-col items-center gap-3 py-12 text-center">
									<ShoppingCart
										aria-hidden
										className="size-8 text-muted-foreground/60"
									/>
									<p className="max-w-56 text-sm text-muted-foreground">
										Nothing added yet. Tap a product, or press Enter to add the
										top search match.
									</p>
								</div>
							) : (
								cart.map((line) => (
									<div
										key={line.product.id}
										className="flex items-start gap-3 border-b py-3 last:border-0"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">
												{line.product.name}
											</p>
											<p className="text-xs text-muted-foreground">
												<Money value={line.product.price} /> each
											</p>
										</div>
										<div className="flex shrink-0 flex-col items-end gap-1.5">
											<span className="text-sm font-semibold tabular-nums">
												<Money value={Number(line.product.price) * line.qty} />
											</span>
											<fieldset
												aria-label={`Quantity for ${line.product.name}`}
												className="flex items-center gap-0.5 rounded-full border p-0.5"
											>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													className="rounded-full"
													aria-label={
														line.qty === 1
															? `Remove ${line.product.name}`
															: `Decrease ${line.product.name}`
													}
													onClick={() => setQty(line.product.id, line.qty - 1)}
												>
													{line.qty === 1 ? <Trash2 /> : <Minus />}
												</Button>
												<span className="w-6 text-center text-sm font-medium tabular-nums">
													{line.qty}
												</span>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													className="rounded-full"
													aria-label={`Increase ${line.product.name}`}
													disabled={line.qty >= line.product.qtyUnits}
													onClick={() => setQty(line.product.id, line.qty + 1)}
												>
													<Plus />
												</Button>
											</fieldset>
										</div>
									</div>
								))
							)}
						</div>

						<div className="shrink-0 space-y-3 border-t px-5 py-4">
							{canCredit ? (
								<div className="space-y-3">
									<div className="grid grid-cols-2 gap-1 rounded-full border p-1 text-sm">
										{(["cash", "credit"] as const).map((option) => (
											<button
												key={option}
												type="button"
												onClick={() => setTender(option)}
												className={
													tender === option
														? "rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground"
														: "rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
												}
											>
												{option === "cash" ? "Cash" : "Credit"}
											</button>
										))}
									</div>
									{tender === "credit" ? (
										<div className="space-y-2">
											<div className="flex items-center justify-between gap-2">
												<span className="text-xs font-medium text-muted-foreground">
													Customer
												</span>
												<button
													type="button"
													onClick={() => setCustomerSheetOpen(true)}
													className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
												>
													<UserPlus aria-hidden className="size-3.5" />
													New customer
												</button>
											</div>
											<Combobox
												items={customers.data ?? []}
												value={customer}
												onValueChange={setCustomer}
												itemToStringLabel={customerLabel}
												filter={matchesCustomer}
											>
												<ComboboxInput
													showClear
													className="w-full"
													placeholder="Search by name or phone…"
													aria-label="Customer"
													onFocus={(event) => event.currentTarget.select()}
												/>
												<ComboboxContent>
													<ComboboxEmpty>No customer matches.</ComboboxEmpty>
													<ComboboxList>
														{(item: Customer) => (
															<ComboboxItem
																key={item.id}
																value={item}
																className="flex-col items-start gap-0.5"
															>
																<span className="font-medium">{item.name}</span>
																<span className="text-xs text-muted-foreground">
																	{item.phone ?? "No phone"}
																</span>
															</ComboboxItem>
														)}
													</ComboboxList>
												</ComboboxContent>
											</Combobox>
											{customer !== null &&
											Number(customer.outstandingBalance) > 0 ? (
												<p className="text-xs text-muted-foreground">
													Owes <Money value={customer.outstandingBalance} />{" "}
													already
												</p>
											) : null}
										</div>
									) : null}
								</div>
							) : null}

							<div className="flex items-baseline justify-between border-t pt-3">
								<span className="text-sm text-muted-foreground">Total</span>
								<span className="font-display text-2xl font-semibold">
									<Money value={total} />
								</span>
							</div>

							{record.isError ? (
								<ErrorNote message={record.error.message} />
							) : null}

							<Button
								className="h-12 w-full text-base"
								disabled={cart.length === 0 || record.isPending || !creditReady}
								onClick={completeSale}
							>
								{record.isPending
									? "Recording…"
									: tender === "credit"
										? "Record credit sale"
										: "Take payment"}
							</Button>
						</div>
					</>
				)}
			</aside>

			<NewCustomerSheet
				open={customerSheetOpen}
				onOpenChange={setCustomerSheetOpen}
				onCreated={(created) => setCustomer(created)}
			/>
		</div>
	);
}
