import { useState } from "react";
import {
	useArchiveSupplier,
	useCreateSupplier,
	useSuppliers,
	useUpdateSupplier,
} from "@/api/hooks";
import type { Supplier } from "@/api/types";
import { EmptyState, ErrorNote, Money, PageHeader } from "@/components/bits";
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

export default function SuppliersPage() {
	const [showArchived, setShowArchived] = useState(false);
	const suppliers = useSuppliers(showArchived);
	const archive = useArchiveSupplier();

	return (
		<div>
			<PageHeader
				title="Suppliers"
				description="Who the store buys from, and what it still owes them."
				action={<SupplierDialog trigger={<Button>New supplier</Button>} />}
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

			{suppliers.data && suppliers.data.length === 0 ? (
				<EmptyState
					title="No suppliers yet"
					hint="Add the wholesalers and distributors you restock from; purchase orders start here."
					action={<SupplierDialog trigger={<Button>New supplier</Button>} />}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Supplier</TableHead>
							<TableHead>Phone</TableHead>
							<TableHead>Note</TableHead>
							<TableHead className="text-right">Owed</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(suppliers.data ?? []).map((supplier) => (
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
