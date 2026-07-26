import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE_NAME = "shelflife_session";

function cookieOptions() {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "Lax" as const,
		secure: process.env.NODE_ENV === "production",
	};
}

export function setSessionCookie(
	context: Context,
	token: string,
	expiresAt: Date,
) {
	setCookie(context, SESSION_COOKIE_NAME, token, {
		...cookieOptions(),
		expires: expiresAt,
	});
}

export function clearSessionCookie(context: Context) {
	deleteCookie(context, SESSION_COOKIE_NAME, cookieOptions());
}
