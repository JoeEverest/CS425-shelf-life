import { z } from "zod";
import { ROLES } from "./permissions";

const requiredText = z.string().trim().min(1);
const roleSchema = z.enum(ROLES);
const rolesSchema = z
	.array(roleSchema)
	.min(1)
	.refine((roles) => new Set(roles).size === roles.length, {
		message: "Roles must not contain duplicates.",
	});

export const userCreateSchema = z
	.object({
		name: requiredText,
		username: requiredText,
		password: z.string().min(8),
		roles: rolesSchema,
	})
	.strict();

export const userUpdateSchema = z
	.object({
		name: requiredText.optional(),
		roles: rolesSchema.optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one user field is required.",
	});

export const storeUpdateSchema = z
	.object({
		name: requiredText.optional(),
		address: requiredText.optional(),
		velocityWindowDays: z.number().int().min(1).max(365).optional(),
		lowStockCoverDays: z.number().int().min(1).max(90).optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one store field is required.",
	});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
