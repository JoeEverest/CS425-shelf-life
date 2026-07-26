import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { loginSchema } from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { unauthenticated } from "../middleware/errors";
import {
	clearSessionCookie,
	SESSION_COOKIE_NAME,
	setSessionCookie,
} from "../middleware/session-cookie";
import { zodJson } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";

export function createAuthRoutes(authService: AuthService) {
	return new Hono<AppEnv>()
		.post("/login", zodJson(loginSchema), async (context) => {
			const session = await authService.login(context.req.valid("json"));
			if (!session) {
				return unauthenticated(context, "Invalid username or password.");
			}

			setSessionCookie(context, session.token, session.expiresAt);
			return context.json(session.user);
		})
		.post("/logout", async (context) => {
			const token = getCookie(context, SESSION_COOKIE_NAME);
			if (token) {
				await authService.logout(token);
			}
			clearSessionCookie(context);
			return context.json({ success: true });
		})
		.get("/me", auth(authService), (context) => {
			return context.json(context.get("authUser"));
		});
}
