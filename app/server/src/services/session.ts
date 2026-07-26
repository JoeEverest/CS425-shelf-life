import { createHash, randomBytes } from "node:crypto";

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function createSessionMaterial(now = new Date()) {
	const token = randomBytes(32).toString("base64url");
	return {
		token,
		tokenHash: hashSessionToken(token),
		expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
	};
}
