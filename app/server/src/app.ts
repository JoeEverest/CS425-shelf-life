import type { Database } from "db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ApiResponse } from "shared";
import type { AppEnv } from "./auth-context";
import { IdentityRepo } from "./repos/identity-repo";
import { SetupRepo } from "./repos/setup-repo";
import { createAuthRoutes } from "./routes/auth";
import { createSetupRoutes } from "./routes/setup";
import { AuthService } from "./services/auth-service";
import { SetupService } from "./services/setup-service";

export function createApp(database: Database) {
	const authService = new AuthService(new IdentityRepo(database));
	const setupService = new SetupService(new SetupRepo(database));

	return new Hono<AppEnv>()
		.use(
			"*",
			cors({
				origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
				credentials: true,
			}),
		)
		.get("/hello", (context) => {
			const response: ApiResponse = {
				message: "Hello BHVR!",
				success: true,
			};
			return context.json(response);
		})
		.get("/api/health", (context) => {
			return context.json({ status: "ok" });
		})
		.route("/api/auth", createAuthRoutes(authService))
		.route("/api/setup", createSetupRoutes(setupService))
		.notFound((context) => {
			return context.json(
				{ code: "NOT_FOUND", message: "The requested resource was not found." },
				404,
			);
		})
		.onError((error, context) => {
			if (error instanceof HTTPException && error.status === 400) {
				return context.json(
					{
						code: "VALIDATION",
						message: error.message,
						issues: [],
					},
					400,
				);
			}

			console.error(error);
			return context.json(
				{ code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
				500,
			);
		});
}
