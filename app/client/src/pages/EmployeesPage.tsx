import { useState } from "react";
import {
	useCreateEmployee,
	useEmployees,
	useMe,
	useSetEmployeeActive,
	useUpdateEmployee,
} from "@/api/hooks";
import type { Employee } from "@/api/types";
import { EmptyState, ErrorNote, PageHeader } from "@/components/bits";
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
import { ROLE_LABELS, type Role } from "@/lib/access";

const ASSIGNABLE_ROLES: Role[] = [
	"admin",
	"manager",
	"sales_clerk",
	"inventory_clerk",
	"accountant",
];

function RoleChecklist({
	value,
	onChange,
}: {
	value: Role[];
	onChange: (roles: Role[]) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{ASSIGNABLE_ROLES.map((role) => (
				<label key={role} className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={value.includes(role)}
						onChange={(event) =>
							onChange(
								event.target.checked
									? [...value, role]
									: value.filter((candidate) => candidate !== role),
							)
						}
					/>
					{ROLE_LABELS[role]}
				</label>
			))}
		</div>
	);
}

function InviteDialog() {
	const [open, setOpen] = useState(false);
	const create = useCreateEmployee();
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [roles, setRoles] = useState<Role[]>([]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>Add employee</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Add employee</DialogTitle>
					<DialogDescription>
						A clerk may hold sales duty, inventory duty, or both.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate(
							{ name, username, password, roles },
							{
								onSuccess: () => {
									setOpen(false);
									setName("");
									setUsername("");
									setPassword("");
									setRoles([]);
								},
							},
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="u-name">Name</FieldLabel>
						<Input
							id="u-name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="u-username">Username</FieldLabel>
						<Input
							id="u-username"
							required
							autoComplete="off"
							value={username}
							onChange={(event) => setUsername(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="u-password">Temporary password</FieldLabel>
						<Input
							id="u-password"
							required
							minLength={8}
							type="text"
							autoComplete="off"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<FieldDescription>
							Share it with the employee; at least 8 characters.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel>Roles</FieldLabel>
						<RoleChecklist value={roles} onChange={setRoles} />
					</Field>
					{create.isError ? <ErrorNote message={create.error.message} /> : null}
					<Button
						type="submit"
						disabled={create.isPending || roles.length === 0}
					>
						{create.isPending ? "Creating…" : "Create account"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditRolesDialog({ employee }: { employee: Employee }) {
	const [open, setOpen] = useState(false);
	const update = useUpdateEmployee();
	const [roles, setRoles] = useState<Role[]>(employee.roles);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Roles
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						Roles — {employee.name}
					</DialogTitle>
					<DialogDescription>
						Changes apply on the employee's next request.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						update.mutate(
							{ id: employee.id, roles },
							{ onSuccess: () => setOpen(false) },
						);
					}}
				>
					<RoleChecklist value={roles} onChange={setRoles} />
					{update.isError ? <ErrorNote message={update.error.message} /> : null}
					<Button
						type="submit"
						disabled={update.isPending || roles.length === 0}
					>
						Save roles
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default function EmployeesPage() {
	const me = useMe();
	const employees = useEmployees();
	const setActive = useSetEmployeeActive();

	return (
		<div>
			<PageHeader
				title="Employees"
				description="Accounts and roles. Deactivated employees keep their history but cannot sign in."
				action={<InviteDialog />}
			/>

			{employees.data && employees.data.length === 0 ? (
				<EmptyState
					title="Just you so far"
					hint="Add each employee with the role that matches their duties behind the counter or in the stockroom."
					action={<InviteDialog />}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Username</TableHead>
							<TableHead>Roles</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(employees.data ?? []).map((employee) => (
							<TableRow
								key={employee.id}
								className={employee.active ? undefined : "opacity-50"}
							>
								<TableCell className="font-medium">{employee.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{employee.username}
								</TableCell>
								<TableCell>
									{employee.roles.map((role) => ROLE_LABELS[role]).join(" · ")}
								</TableCell>
								<TableCell>
									{employee.active ? "Active" : "Deactivated"}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<EditRolesDialog employee={employee} />
										<Button
											variant="ghost"
											size="sm"
											disabled={
												setActive.isPending || employee.id === me.data?.id
											}
											onClick={() =>
												setActive.mutate({
													id: employee.id,
													active: !employee.active,
												})
											}
										>
											{employee.active ? "Deactivate" : "Reactivate"}
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			{setActive.isError ? (
				<ErrorNote message={setActive.error.message} />
			) : null}
		</div>
	);
}
