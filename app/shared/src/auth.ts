import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const loginSchema = z.object({
	username: requiredText,
	password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z.object({
	storeName: requiredText,
	currency: z
		.string()
		.regex(/^[A-Za-z]{3}$/, "Currency must be exactly three letters.")
		.transform((currency) => currency.toUpperCase()),
	address: requiredText,
	admin: z.object({
		name: requiredText,
		username: requiredText,
		password: z.string().min(8),
	}),
});

export type SetupInput = z.infer<typeof setupSchema>;
