import { useMemo, useState } from "react";
import {
	useCreateEmployee,
	useEmployees,
	useMe,
	useSetEmployeeActive,
	useUpdateEmployee,
} from "@/api/hooks";
import type { Employee } from "@/api/types";
import {
	EmptyState,
	ErrorNote,
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
import { compareValues, useSortState } from "@/hooks/use-sort";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/access";

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

type EmployeeSortKey = "name" | "username" | "roles" | "status";
type ActiveFilter = "all" | "active" | "inactive";

function roleText(employee: Employee): string {
	return employee.roles.map((role) => ROLE_LABELS[role]).join(" · ");
}

function employeeValue(employee: Employee, key: EmployeeSortKey): string {
	switch (key) {
		case "username":
			return employee.username;
		case "roles":
			return roleText(employee);
		case "status":
			return employee.active ? "Active" : "Deactivated";
		default:
			return employee.name;
	}
}

export default function EmployeesPage() {
	const me = useMe();
	const employees = useEmployees();
	const setActive = useSetEmployeeActive();
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<Role | "all">("all");
	const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
	const { sort, toggle } = useSortState<EmployeeSortKey>("name");

	const rows = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = (employees.data ?? []).filter((employee) => {
			if (role !== "all" && !employee.roles.includes(role)) {
				return false;
			}
			if (activeFilter === "active" && !employee.active) {
				return false;
			}
			if (activeFilter === "inactive" && employee.active) {
				return false;
			}
			if (q === "") {
				return true;
			}
			return (
				employee.name.toLowerCase().includes(q) ||
				employee.username.toLowerCase().includes(q) ||
				roleText(employee).toLowerCase().includes(q)
			);
		});
		return filtered.sort((left, right) =>
			compareValues(
				employeeValue(left, sort.key),
				employeeValue(right, sort.key),
				sort.direction,
			),
		);
	}, [employees.data, query, role, activeFilter, sort]);

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
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-3">
						<SearchInput
							value={query}
							onChange={setQuery}
							label="Search employees"
							placeholder="Search by name, username or role…"
						/>
						<NativeSelect
							aria-label="Filter by role"
							value={role}
							onChange={(event) => setRole(event.target.value as Role | "all")}
						>
							<NativeSelectOption value="all">All roles</NativeSelectOption>
							{ROLES.map((option) => (
								<NativeSelectOption key={option} value={option}>
									{ROLE_LABELS[option]}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="Filter by status"
							value={activeFilter}
							onChange={(event) =>
								setActiveFilter(event.target.value as ActiveFilter)
							}
						>
							<NativeSelectOption value="all">All statuses</NativeSelectOption>
							<NativeSelectOption value="active">Active</NativeSelectOption>
							<NativeSelectOption value="inactive">
								Deactivated
							</NativeSelectOption>
						</NativeSelect>
						<span className="ml-auto text-sm text-muted-foreground tabular-nums">
							{rows.length} of {employees.data?.length ?? 0}
						</span>
					</div>

					{rows.length === 0 ? (
						<p className="rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground">
							No employee matches this search.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead column="name" sort={sort} onSort={toggle}>
										Name
									</SortableHead>
									<SortableHead column="username" sort={sort} onSort={toggle}>
										Username
									</SortableHead>
									<SortableHead column="roles" sort={sort} onSort={toggle}>
										Roles
									</SortableHead>
									<SortableHead column="status" sort={sort} onSort={toggle}>
										Status
									</SortableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((employee) => (
									<TableRow
										key={employee.id}
										className={employee.active ? undefined : "opacity-50"}
									>
										<TableCell className="font-medium">
											{employee.name}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{employee.username}
										</TableCell>
										<TableCell>{roleText(employee)}</TableCell>
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
				</div>
			)}
			{setActive.isError ? (
				<ErrorNote message={setActive.error.message} />
			) : null}
		</div>
	);
}
