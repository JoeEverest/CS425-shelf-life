import { useState } from "react";
import {
	useArchiveProduct,
	useCategories,
	useCreateCategory,
	useCreateProduct,
	useMe,
	usePriceHistory,
	useProducts,
	usePublishProduct,
	useSetPrice,
} from "@/api/hooks";
import type { Product } from "@/api/types";
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
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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

function CreateProductDialog() {
	const categories = useCategories();
	const createCategory = useCreateCategory();
	const create = useCreateProduct();
	const [open, setOpen] = useState(false);
	const [newCategory, setNewCategory] = useState("");
	const [form, setForm] = useState({
		sku: "",
		name: "",
		categoryId: "",
		bulkUnitName: "",
		unitsPerBulk: "12",
		saleUnitName: "",
		bulkCost: "",
	});

	const set = (key: keyof typeof form) => (value: string) =>
		setForm((current) => ({ ...current, [key]: value }));

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>New product</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="font-display">New product</DialogTitle>
					<DialogDescription>
						Products are created unpriced; a manager sets the sale price.
					</DialogDescription>
				</DialogHeader>
				<form
					id="create-product"
					className="grid gap-4 sm:grid-cols-2"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{
								sku: form.sku,
								name: form.name,
								categoryId: form.categoryId,
								bulkUnitName: form.bulkUnitName,
								unitsPerBulk: Number(form.unitsPerBulk),
								saleUnitName: form.saleUnitName,
								bulkCost: form.bulkCost,
							},
							{ onSuccess: () => setOpen(false) },
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="p-sku">SKU</FieldLabel>
						<Input
							id="p-sku"
							required
							value={form.sku}
							onChange={(e) => set("sku")(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="p-name">Name</FieldLabel>
						<Input
							id="p-name"
							required
							value={form.name}
							onChange={(e) => set("name")(e.target.value)}
						/>
					</Field>
					<Field className="sm:col-span-2">
						<FieldLabel htmlFor="p-category">Category</FieldLabel>
						<div className="flex gap-2">
							<NativeSelect
								id="p-category"
								required
								value={form.categoryId}
								onChange={(e) => set("categoryId")(e.target.value)}
							>
								<NativeSelectOption value="">
									Choose a category…
								</NativeSelectOption>
								{(categories.data ?? []).map((category) => (
									<NativeSelectOption key={category.id} value={category.id}>
										{category.name}
									</NativeSelectOption>
								))}
							</NativeSelect>
							<Input
								aria-label="New category name"
								placeholder="or add new…"
								value={newCategory}
								onChange={(e) => setNewCategory(e.target.value)}
								className="max-w-36"
							/>
							<Button
								type="button"
								variant="outline"
								disabled={
									newCategory.trim().length === 0 || createCategory.isPending
								}
								onClick={() =>
									createCategory.mutate(
										{ name: newCategory.trim() },
										{
											onSuccess: (category) => {
												setNewCategory("");
												set("categoryId")(category.id);
											},
										},
									)
								}
							>
								Add
							</Button>
						</div>
					</Field>
					<Field>
						<FieldLabel htmlFor="p-bulk">Bulk unit</FieldLabel>
						<Input
							id="p-bulk"
							required
							placeholder="dozen"
							value={form.bulkUnitName}
							onChange={(e) => set("bulkUnitName")(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="p-upb">Units per bulk</FieldLabel>
						<Input
							id="p-upb"
							required
							type="number"
							min={1}
							step={1}
							className="tabular-nums"
							value={form.unitsPerBulk}
							onChange={(e) => set("unitsPerBulk")(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="p-sale">Sale unit</FieldLabel>
						<Input
							id="p-sale"
							required
							placeholder="piece"
							value={form.saleUnitName}
							onChange={(e) => set("saleUnitName")(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="p-cost">Bulk cost</FieldLabel>
						<Input
							id="p-cost"
							required
							inputMode="decimal"
							pattern="\d+\.\d{2}"
							placeholder="5000.00"
							className="tabular-nums"
							value={form.bulkCost}
							onChange={(e) => set("bulkCost")(e.target.value)}
						/>
						<FieldDescription>Two decimals, e.g. 5000.00</FieldDescription>
					</Field>
				</form>
				{create.isError ? <ErrorNote message={create.error.message} /> : null}
				<DialogFooter>
					<Button
						form="create-product"
						type="submit"
						disabled={create.isPending}
					>
						{create.isPending ? "Saving…" : "Create draft"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PriceDialog({ product }: { product: Product }) {
	const [open, setOpen] = useState(false);
	const setPrice = useSetPrice();
	const history = usePriceHistory(open ? product.id : null);
	const [price, setPriceValue] = useState(product.price ?? "");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					{product.price === null ? "Set price" : "Price"}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						Price — {product.name}
					</DialogTitle>
					<DialogDescription>
						Sold per {product.saleUnitName}. Unit cost is{" "}
						<Money
							value={(Number(product.bulkCost) / product.unitsPerBulk).toFixed(
								2,
							)}
						/>{" "}
						from a {product.bulkUnitName} of {product.unitsPerBulk}.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex items-end gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						setPrice.mutate(
							{ id: product.id, price },
							{ onSuccess: () => setOpen(false) },
						);
					}}
				>
					<Field className="flex-1">
						<FieldLabel htmlFor="price">New price</FieldLabel>
						<Input
							id="price"
							required
							inputMode="decimal"
							pattern="\d+\.\d{2}"
							className="tabular-nums"
							value={price}
							onChange={(event) => setPriceValue(event.target.value)}
						/>
					</Field>
					<Button type="submit" disabled={setPrice.isPending}>
						Save
					</Button>
				</form>
				{setPrice.isError ? (
					<ErrorNote message={setPrice.error.message} />
				) : null}
				<div className="space-y-2">
					<h3 className="text-sm font-medium">History</h3>
					{history.data && history.data.length > 0 ? (
						<ul className="space-y-1 text-sm">
							{history.data.map((change) => (
								<li
									key={change.id}
									className="flex justify-between text-muted-foreground"
								>
									<span className="tabular-nums">
										{new Date(change.createdAt).toLocaleDateString()}
									</span>
									<span className="tabular-nums">
										{change.oldPrice ?? "unpriced"} → {change.newPrice}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							No price changes recorded yet.
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default function ProductsPage() {
	const me = useMe();
	const [showArchived, setShowArchived] = useState(false);
	const products = useProducts(showArchived);
	const publish = usePublishProduct();
	const archive = useArchiveProduct();

	const roles = me.data?.roles ?? [];
	const canCreate = can(roles, PERMISSIONS.PRODUCTS_CREATE_PUBLISH);
	const canPrice = can(roles, PERMISSIONS.PRODUCTS_SET_PRICE);
	const canArchive = can(roles, PERMISSIONS.PRODUCTS_ARCHIVE);

	return (
		<div>
			<PageHeader
				title="Products"
				description="Bought in bulk, sold by the unit. Drafts publish once; managers price and correct."
				action={canCreate ? <CreateProductDialog /> : undefined}
			/>

			<div className="flex justify-end pb-3">
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(event) => setShowArchived(event.target.checked)}
					/>
					Show archived
				</label>
			</div>

			{products.data && products.data.length === 0 ? (
				<EmptyState
					title="No products yet"
					hint="Create the first product as a draft, publish it, then have a manager set its price — after that it can be sold."
					action={canCreate ? <CreateProductDialog /> : undefined}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Product</TableHead>
							<TableHead>Category</TableHead>
							<TableHead className="text-right">Breakdown</TableHead>
							<TableHead className="text-right">Stock</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(products.data ?? []).map((product) => (
							<TableRow
								key={product.id}
								className={product.archived ? "opacity-50" : undefined}
							>
								<TableCell className="font-medium tabular-nums">
									{product.sku}
								</TableCell>
								<TableCell>{product.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{product.categoryName}
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									1 {product.bulkUnitName} ={" "}
									<span className="tabular-nums">{product.unitsPerBulk}</span>{" "}
									{product.saleUnitName}
								</TableCell>
								<TableCell className="text-right">
									<Qty value={product.qtyUnits} unit={product.saleUnitName} />
								</TableCell>
								<TableCell className="text-right">
									<Money value={product.price} />
								</TableCell>
								<TableCell>
									{product.archived
										? "Archived"
										: product.published
											? "Published"
											: "Draft"}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										{canCreate && !product.published && !product.archived ? (
											<Button
												variant="outline"
												size="sm"
												disabled={publish.isPending}
												onClick={() => publish.mutate(product.id)}
											>
												Publish
											</Button>
										) : null}
										{canPrice && !product.archived ? (
											<PriceDialog product={product} />
										) : null}
										{canArchive && !product.archived ? (
											<Button
												variant="ghost"
												size="sm"
												disabled={archive.isPending}
												onClick={() => archive.mutate(product.id)}
											>
												Archive
											</Button>
										) : null}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
