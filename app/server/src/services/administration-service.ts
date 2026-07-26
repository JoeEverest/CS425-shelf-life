import type {
	Role,
	StoreUpdateInput,
	UserCreateInput,
	UserUpdateInput,
} from "shared";
import {
	type AdministrationRepo,
	DuplicateUsernameRepoError,
	LastAdminRepoError,
} from "../repos/administration-repo";
import {
	actorMayChangeAdminMembership,
	canDeactivateEmployee,
	rolesChangeAdminMembership,
} from "../rules/employee-lockout";
import { DomainError } from "./domain-error";

type Actor = { id: string; roles: readonly Role[] };

export class AdministrationService {
	constructor(private readonly administrationRepo: AdministrationRepo) {}

	listUsers() {
		return this.administrationRepo.listUsers();
	}

	async createUser(input: UserCreateInput) {
		const passwordHash = await Bun.password.hash(input.password, {
			algorithm: "argon2id",
		});

		try {
			const id = await this.administrationRepo.createUser({
				...input,
				passwordHash,
			});
			return this.requireUser(id);
		} catch (error) {
			if (error instanceof DuplicateUsernameRepoError) {
				throw new DomainError(
					409,
					"DUPLICATE_USERNAME",
					"A user with that username already exists.",
				);
			}
			throw error;
		}
	}

	async updateUser(id: string, input: UserUpdateInput, actor: Actor) {
		if (input.roles) {
			const target = await this.requireUser(id);
			// Only an admin may grant or revoke admin — otherwise a manager
			// (who also holds employees.manage) could escalate themselves or
			// strip the store's only admin.
			if (
				rolesChangeAdminMembership(target.roles, input.roles) &&
				!actorMayChangeAdminMembership(actor)
			) {
				throw new DomainError(
					403,
					"FORBIDDEN",
					"Only an administrator can grant or revoke the admin role.",
				);
			}
		}

		try {
			if (!(await this.administrationRepo.updateUser(id, input))) {
				throw new DomainError(404, "USER_NOT_FOUND", "User not found.");
			}
		} catch (error) {
			if (error instanceof LastAdminRepoError) {
				throw new DomainError(
					409,
					"LAST_ADMIN",
					"The store must keep at least one active administrator.",
				);
			}
			throw error;
		}
		return this.requireUser(id);
	}

	async deactivateUser(id: string, actorId: string) {
		if (!canDeactivateEmployee(actorId, id)) {
			throw new DomainError(
				409,
				"CANNOT_DEACTIVATE_SELF",
				"A user cannot deactivate their own account.",
			);
		}
		return this.setUserActive(id, false);
	}

	reactivateUser(id: string) {
		return this.setUserActive(id, true);
	}

	async getStore() {
		const store = await this.administrationRepo.getStore();
		if (!store) {
			throw new DomainError(404, "STORE_NOT_FOUND", "Store not found.");
		}
		return store;
	}

	async updateStore(input: StoreUpdateInput) {
		const store = await this.administrationRepo.updateStore(input);
		if (!store) {
			throw new DomainError(404, "STORE_NOT_FOUND", "Store not found.");
		}
		return store;
	}

	private async setUserActive(id: string, active: boolean) {
		try {
			if (!(await this.administrationRepo.setUserActive(id, active))) {
				throw new DomainError(404, "USER_NOT_FOUND", "User not found.");
			}
		} catch (error) {
			if (error instanceof LastAdminRepoError) {
				throw new DomainError(
					409,
					"LAST_ADMIN",
					"The store must keep at least one active administrator.",
				);
			}
			throw error;
		}
		return this.requireUser(id);
	}

	private async requireUser(id: string) {
		const user = await this.administrationRepo.findUserById(id);
		if (!user) {
			throw new DomainError(404, "USER_NOT_FOUND", "User not found.");
		}
		return user;
	}
}
