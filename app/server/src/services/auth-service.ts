import type { LoginInput } from "shared";
import type { AuthenticatedUser } from "../auth-context";
import type { IdentityRecord, IdentityRepo } from "../repos/identity-repo";
import { createSessionMaterial, hashSessionToken } from "./session";

export type AuthSession = {
	token: string;
	expiresAt: Date;
	user: AuthenticatedUser;
};

export type ResolvedSession = {
	sessionId: string;
	user: AuthenticatedUser;
};

function toAuthenticatedUser(identity: IdentityRecord): AuthenticatedUser {
	return {
		id: identity.id,
		name: identity.name,
		username: identity.username,
		roles: identity.roles,
	};
}

async function passwordMatches(
	password: string,
	hash: string,
): Promise<boolean> {
	try {
		return await Bun.password.verify(password, hash);
	} catch {
		return false;
	}
}

// Verified against when the username has no account, so unknown and known
// usernames cost the same argon2id work and stay timing-indistinguishable.
const dummyHashPromise = Bun.password.hash("shelflife-dummy-password", {
	algorithm: "argon2id",
});

export class AuthService {
	constructor(private readonly identityRepo: IdentityRepo) {}

	async login(input: LoginInput): Promise<AuthSession | undefined> {
		const identity = await this.identityRepo.findByUsername(input.username);

		const matches = await passwordMatches(
			input.password,
			identity?.passwordHash ?? (await dummyHashPromise),
		);

		if (!identity?.active || !matches) {
			return undefined;
		}

		const session = createSessionMaterial();
		await this.identityRepo.createSession(
			identity.id,
			session.tokenHash,
			session.expiresAt,
		);

		return {
			token: session.token,
			expiresAt: session.expiresAt,
			user: toAuthenticatedUser(identity),
		};
	}

	async resolveSession(token: string): Promise<ResolvedSession | undefined> {
		const identity = await this.identityRepo.findBySessionHash(
			hashSessionToken(token),
		);

		if (!identity) {
			return undefined;
		}

		if (identity.expiresAt.getTime() <= Date.now()) {
			await this.identityRepo.deleteSessionById(identity.sessionId);
			return undefined;
		}

		if (!identity.active) {
			return undefined;
		}

		return {
			sessionId: identity.sessionId,
			user: toAuthenticatedUser(identity),
		};
	}

	async logout(token: string): Promise<void> {
		await this.identityRepo.deleteSessionByHash(hashSessionToken(token));
	}
}
