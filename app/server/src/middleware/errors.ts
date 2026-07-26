import type { Context } from "hono";

export type ErrorEnvelope = {
	code: string;
	message: string;
};

export function unauthenticated(
	c: Context,
	message = "Authentication is required.",
) {
	return c.json({ code: "UNAUTHENTICATED", message }, 401);
}

export function forbidden(c: Context) {
	return c.json(
		{ code: "FORBIDDEN", message: "You do not have permission to do that." },
		403,
	);
}
