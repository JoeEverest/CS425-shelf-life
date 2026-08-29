import { useMemo, useState } from "react";
import {
	useArchiveSupplier,
	useCreateSupplier,
	useSuppliers,
	useUpdateSupplier,
} from "@/api/hooks";
import type { Supplier } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
	Money,
	PageHeader,
	SearchInput,
} from "@/components/bits";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { compareValues, useSortState } from "@/hooks/use-sort";

function SupplierDialog({
	supplier,
	trigger,
}: {
	supplier?: Supplier;
	trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const create = useCreateSupplier();
	const update = useUpdateSupplier();
	const [name, setName] = useState(supplier?.name ?? "");
	const [phone, setPhone] = useState(supplier?.phone ?? "");
	const [note, setNote] = useState(supplier?.note ?? "");
	const mutation = supplier ? update : create;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						{supplier ? `Edit — ${supplier.name}` : "New supplier"}
					</DialogTitle>
					<DialogDescription>
						Suppliers with purchase history are archived, never deleted.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						const body = {
							name,
							phone: phone.trim() === "" ? undefined : phone,
							note: note.trim() === "" ? undefined : note,
						};
						if (supplier) {
							update.mutate(
								{ id: supplier.id, ...body },
								{ onSuccess: () => setOpen(false) },
							);
						} else {
							create.mutate(body, {
								onSuccess: () => {
									setOpen(false);
									setName("");
									setPhone("");
									setNote("");
								},
							});
						}
					}}
				>
					<Field>
						<FieldLabel htmlFor="s-name">Name</FieldLabel>
						<Input
							id="s-name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="s-phone">Phone</FieldLabel>
						<Input
							id="s-phone"
							value={phone}
							onChange={(event) => setPhone(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="s-note">Note</FieldLabel>
						<Input
							id="s-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</Field>
					{mutation.isError ? (
						<ErrorNote message={mutation.error.message} />
					) : null}
					<Button type="submit" disabled={mutation.isPending}>
						{supplier ? "Save changes" : "Add supplier"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type SupplierSortKey = "name" | "phone" | "note" | "owed";

function supplierValue(
	supplier: Supplier,
	key: SupplierSortKey,
): string | number | null {
	switch (key) {
		case "phone":
			return supplier.phone;
		case "note":
			return supplier.note;
		case "owed":
			return Number(supplier.outstandingBalance);
		default:
			return supplier.name;
	}
}

export default function SuppliersPage() {
	const [showArchived, setShowArchived] = useState(false);
	const suppliers = useSuppliers(showArchived);
	const archive = useArchiveSupplier();
	const [query, setQuery] = useState("");
	const { sort, toggle } = useSortState<SupplierSortKey>("name");

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		const digits = q.replace(/\D/g, "");
		const filtered = (suppliers.data ?? []).filter((supplier) => {
			if (q === "") {
				return true;
			}
			return (
				supplier.name.toLowerCase().includes(q) ||
				(digits !== "" &&
					(supplier.phone ?? "").replace(/\D/g, "").includes(digits)) ||
				(supplier.note ?? "").toLowerCase().includes(q)
			);
		});
		return filtered.sort((left, right) =>
			compareValues(
				supplierValue(left, sort.key),
				supplierValue(right, sort.key),
				sort.direction,
			),
		);
	}, [suppliers.data, query, sort]);

	return (
		<div>
			<PageHeader
				title="Suppliers"
				description="Who the store buys from, and what it still owes them."
				action={<SupplierDialog trigger={<Button>New supplier</Button>} />}
			/>

			<div className="flex flex-wrap items-center gap-3 pb-3">
				<SearchInput
					value={query}
					onChange={setQuery}
					label="Search suppliers"
					placeholder="Search by name, phone or note…"
				/>
				<label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(event) => setShowArchived(event.target.checked)}
					/>
					Show archived
				</label>
			</div>

			{suppliers.data && suppliers.data.length === 0 ? (
				<EmptyState
					title="No suppliers yet"
					hint="Add the wholesalers and distributors you restock from; purchase orders start here."
					action={<SupplierDialog trigger={<Button>New supplier</Button>} />}
				/>
			) : matches.length === 0 ? (
				<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
					No supplier matches “{query}”.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<SortableHead column="name" sort={sort} onSort={toggle}>
								Supplier
							</SortableHead>
							<SortableHead column="phone" sort={sort} onSort={toggle}>
								Phone
							</SortableHead>
							<SortableHead column="note" sort={sort} onSort={toggle}>
								Note
							</SortableHead>
							<SortableHead
								column="owed"
								sort={sort}
								onSort={toggle}
								className="text-right"
							>
								Owed
							</SortableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{matches.map((supplier) => (
							<TableRow
								key={supplier.id}
								className={supplier.archived ? "opacity-50" : undefined}
							>
								<TableCell className="font-medium">{supplier.name}</TableCell>
								<TableCell className="tabular-nums">
									{supplier.phone ?? "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{supplier.note ?? "—"}
								</TableCell>
								<TableCell className="text-right">
									<Money value={supplier.outstandingBalance} />
								</TableCell>
								<TableCell className="text-right">
									{supplier.archived ? null : (
										<div className="flex justify-end gap-2">
											<SupplierDialog
												supplier={supplier}
												trigger={
													<Button variant="outline" size="sm">
														Edit
													</Button>
												}
											/>
											<Button
												variant="ghost"
												size="sm"
												disabled={archive.isPending}
												onClick={() => archive.mutate(supplier.id)}
											>
												Archive
											</Button>
										</div>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
