import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../auth-context";
import type { AuthService } from "../services/auth-service";
import { unauthenticated } from "./errors";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export function auth(authService: AuthService): MiddlewareHandler<AppEnv> {
	return async (context, next) => {
		const token = getCookie(context, SESSION_COOKIE_NAME);
		if (!token) {
			return unauthenticated(context);
		}

		const session = await authService.resolveSession(token);
		if (!session) {
			return unauthenticated(context);
		}

		context.set("authUser", session.user);
		context.set("sessionId", session.sessionId);
		await next();
	};
}
