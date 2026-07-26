import { z } from "zod";

const requiredText = z.string().trim().min(1);
const money = z
	.string()
	.regex(
		/^\d{1,10}\.\d{2}$/,
		"Money must be a non-negative string with two decimal places.",
	);

export const resourceIdParamsSchema = z
	.object({ id: z.string().uuid() })
	.strict();

export const archivedFilterSchema = z
	.object({
		archived: z
			.enum(["true", "false"])
			.default("false")
			.transform((value) => value === "true"),
	})
	.strict();

export const categoryCreateSchema = z
	.object({
		name: requiredText,
	})
	.strict();

export const categoryUpdateSchema = categoryCreateSchema;

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

const productFields = {
	sku: requiredText,
	name: requiredText,
	categoryId: z.string().uuid(),
	bulkUnitName: requiredText,
	unitsPerBulk: z.number().int().positive().max(2_147_483_647),
	saleUnitName: requiredText,
	bulkCost: money,
};

// Price is deliberately absent: BR-PriceControl — only a manager sets prices,
// via the dedicated set-price route (SHE-7). Products are created unpriced.
export const productCreateSchema = z.object(productFields).strict();

export const productUpdateSchema = z
	.object({
		sku: productFields.sku.optional(),
		name: productFields.name.optional(),
		categoryId: productFields.categoryId.optional(),
		bulkUnitName: productFields.bulkUnitName.optional(),
		unitsPerBulk: productFields.unitsPerBulk.optional(),
		saleUnitName: productFields.saleUnitName.optional(),
		bulkCost: productFields.bulkCost.optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one product field is required.",
	});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const stockAdjustmentSchema = z
	.object({
		productId: z.string().uuid(),
		deltaUnits: z
			.number()
			.int()
			.min(-1_000_000)
			.max(1_000_000)
			.refine((value) => value !== 0, {
				message: "Adjustment delta must not be zero.",
			}),
		note: z.string().trim().min(3),
	})
	.strict();

export const stockMovementsQuerySchema = z
	.object({
		productId: z.string().uuid(),
	})
	.strict();

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
