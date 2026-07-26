import type { MiddlewareHandler } from "hono";

/**
 * Minimal structured (JSON) request logging. One line per request with method,
 * path, status, and duration — enough to trace and time requests in production
 * without pulling in a logging framework. Health checks are skipped to keep
 * readiness-probe traffic out of the logs.
 */
export function requestLogger(): MiddlewareHandler {
	return async (context, next) => {
		const start = performance.now();
		await next();
		const path = context.req.path;
		if (path.startsWith("/api/health")) {
			return;
		}
		const durationMs = Math.round((performance.now() - start) * 10) / 10;
		console.log(
			JSON.stringify({
				level: context.res.status >= 500 ? "error" : "info",
				method: context.req.method,
				path,
				status: context.res.status,
				durationMs,
				at: new Date().toISOString(),
			}),
		);
	};
}
