import { Hono } from "hono";
import { setupSchema } from "shared";
import type { AppEnv } from "../auth-context";
import { setSessionCookie } from "../middleware/session-cookie";
import { zodJson } from "../middleware/validate";
import {
	SetupAlreadyCompleteError,
	type SetupService,
} from "../services/setup-service";

export function createSetupRoutes(setupService: SetupService) {
	return new Hono<AppEnv>()
		.get("/status", async (context) => {
			return context.json(await setupService.status());
		})
		.post(
			"/",
			async (context, next) => {
				if (!(await setupService.status()).needed) {
					return context.json(
						{
							code: "SETUP_ALREADY_COMPLETE",
							message: "ShelfLife setup has already been completed.",
						},
						403,
					);
				}
				await next();
			},
			zodJson(setupSchema),
			async (context) => {
				try {
					const session = await setupService.setup(context.req.valid("json"));
					setSessionCookie(context, session.token, session.expiresAt);
					return context.json(session.user, 201);
				} catch (error) {
					if (error instanceof SetupAlreadyCompleteError) {
						return context.json(
							{
								code: "SETUP_ALREADY_COMPLETE",
								message: error.message,
							},
							403,
						);
					}
					throw error;
				}
			},
		);
}
