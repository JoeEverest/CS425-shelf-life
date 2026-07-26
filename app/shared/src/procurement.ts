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

const money = z
	.string()
	.regex(
		/^\d{1,10}\.\d{2}$/,
		"Money must be a non-negative string with two decimal places.",
	);

const receiptPaymentSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("immediate"),
			amount: money.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("partial"),
			amount: money,
		})
		.strict(),
	z
		.object({
			kind: z.literal("deferred"),
			amount: money.optional(),
		})
		.strict(),
]);

export const goodsReceiptCreateSchema = z
	.object({
		lines: z
			.array(
				z
					.object({
						poLineId: z.string().uuid(),
						qtyBulkReceived: z.number().int().nonnegative().max(2_147_483_647),
					})
					.strict(),
			)
			.min(1),
		payment: receiptPaymentSchema,
		discrepancyNote: z.string().trim().min(1).optional(),
		discrepancyConfirmed: z.boolean().optional(),
	})
	.strict()
	.superRefine((input, context) => {
		const ids = new Set<string>();
		for (const [index, line] of input.lines.entries()) {
			if (ids.has(line.poLineId)) {
				context.addIssue({
					code: "custom",
					message: "Each purchase-order line may appear only once.",
					path: ["lines", index, "poLineId"],
				});
			}
			ids.add(line.poLineId);
		}
	});

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PurchaseOrderCreateInput = z.infer<
	typeof purchaseOrderCreateSchema
>;
export type PurchaseOrderStatus = z.infer<
	typeof purchaseOrderStatusQuerySchema
>["status"];
export type GoodsReceiptCreateInput = z.infer<typeof goodsReceiptCreateSchema>;
