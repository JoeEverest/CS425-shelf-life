import { z } from "zod";

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.optional();

export const supplierCreateSchema = z
	.object({
		name: requiredText,
		phone: optionalText,
		note: optionalText,
	})
	.strict();

export const supplierUpdateSchema = z
	.object({
		name: requiredText.optional(),
		phone: requiredText.nullable().optional(),
		note: requiredText.nullable().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one supplier field is required.",
	});

export const purchaseOrderCreateSchema = z
	.object({
		supplierId: z.string().uuid(),
		lines: z
			.array(
				z
					.object({
						productId: z.string().uuid(),
						qtyBulk: z.number().int().positive().max(2_147_483_647),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

export const purchaseOrderStatusQuerySchema = z
	.object({
		status: z.enum(["open", "partially_received", "received"]).optional(),
	})
	.strict();

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PurchaseOrderCreateInput = z.infer<
	typeof purchaseOrderCreateSchema
>;
export type PurchaseOrderStatus = z.infer<
	typeof purchaseOrderStatusQuerySchema
>["status"];
