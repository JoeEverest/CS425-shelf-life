import { validator } from "hono/validator";
import type { z } from "zod";

export function zodJson<TSchema extends z.ZodType>(schema: TSchema) {
	return validator("json", (value, context) => {
		const result = schema.safeParse(value);
		if (!result.success) {
			return context.json(
				{
					code: "VALIDATION",
					message: "Request validation failed.",
					issues: result.error.issues,
				},
				400,
			);
		}

		return result.data as z.output<TSchema>;
	});
}
