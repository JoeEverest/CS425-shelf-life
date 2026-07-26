import type { SetupInput } from "shared";
import { isDatabaseError } from "../repos/database-errors";
import type { BootstrapResult, SetupRepo } from "../repos/setup-repo";
import type { AuthSession } from "./auth-service";
import { createSessionMaterial } from "./session";

export class SetupAlreadyCompleteError extends Error {
	constructor() {
		super("ShelfLife setup has already been completed.");
		this.name = "SetupAlreadyCompleteError";
	}
}

export class SetupService {
	constructor(private readonly setupRepo: SetupRepo) {}

	async status(): Promise<{ needed: boolean }> {
		return { needed: !(await this.setupRepo.hasUsers()) };
	}

	async setup(input: SetupInput): Promise<AuthSession> {
		if (await this.setupRepo.hasUsers()) {
			throw new SetupAlreadyCompleteError();
		}

		const passwordHash = await Bun.password.hash(input.admin.password, {
			algorithm: "argon2id",
		});
		const session = createSessionMaterial();

		let result: BootstrapResult | undefined;
		try {
			result = await this.setupRepo.bootstrap({
				store: {
					name: input.storeName,
					currency: input.currency,
					address: input.address,
				},
				admin: {
					name: input.admin.name,
					username: input.admin.username,
					passwordHash,
				},
				session: {
					tokenHash: session.tokenHash,
					expiresAt: session.expiresAt,
				},
			});
		} catch (error) {
			if (await this.setupRepo.hasUsers()) {
				throw new SetupAlreadyCompleteError();
			}
			// A serialization abort can fire before the winning transaction
			// commits, in which case hasUsers() is still false — the loser of
			// the race still means setup happened (or is happening) elsewhere.
			if (isDatabaseError(error, "40001") || isDatabaseError(error, "40P01")) {
				throw new SetupAlreadyCompleteError();
			}
			throw error;
		}

		if (!result) {
			throw new SetupAlreadyCompleteError();
		}

		return {
			token: session.token,
			expiresAt: session.expiresAt,
			user: {
				id: result.userId,
				name: input.admin.name,
				username: input.admin.username,
				roles: ["admin"],
			},
		};
	}
}
