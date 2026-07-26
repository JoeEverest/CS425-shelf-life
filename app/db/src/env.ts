import { z } from "zod";

const postgresUrl = z
	.string()
	.url()
	.refine((value) => {
		const protocol = new URL(value).protocol;
		return protocol === "postgres:" || protocol === "postgresql:";
	}, "DATABASE_URL must use the postgres:// or postgresql:// protocol");

export const databaseEnvSchema = z.object({
	DATABASE_URL: postgresUrl,
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export function readDatabaseEnv(
	values: Record<string, string | undefined> = process.env,
): DatabaseEnv {
	return databaseEnvSchema.parse(values);
}
