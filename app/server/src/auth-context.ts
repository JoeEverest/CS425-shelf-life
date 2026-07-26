import type { Role } from "shared";

export type AuthenticatedUser = {
	id: string;
	name: string;
	username: string;
	roles: Role[];
};

export type AppEnv = {
	Variables: {
		authUser: AuthenticatedUser;
		sessionId: string;
	};
};
