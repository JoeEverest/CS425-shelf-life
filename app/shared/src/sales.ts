import { z } from "zod";

const saleLineSchema = z
	.object({
		productId: z.string().uuid(),
		qtyUnits: z.number().int().positive().max(2_147_483_647),
	})
	// Unknown line fields (including a client-supplied price) are discarded.
	// The server always snapshots products.price when the sale is recorded.
	.strip();

export const cashSaleCreateSchema = z
	.object({
		type: z.literal("cash"),
		lines: z.array(saleLineSchema).min(1),
	})
	.strict();

export const creditSaleCreateSchema = z
	.object({
		type: z.literal("credit"),
		customerId: z.string().uuid(),
		lines: z.array(saleLineSchema).min(1),
	})
	.strict();

export const saleCreateSchema = z.discriminatedUnion("type", [
	cashSaleCreateSchema,
	creditSaleCreateSchema,
]);

export const salesListQuerySchema = z
	.object({
		from: z.iso.date().optional(),
		to: z.iso.date().optional(),
	})
	.strict()
	.refine(
		(period) =>
			period.from === undefined ||
			period.to === undefined ||
			period.from < period.to,
		{
			message: "The from date must be before the to date.",
			path: ["to"],
		},
	);

export type CashSaleCreateInput = z.infer<typeof cashSaleCreateSchema>;
export type CreditSaleCreateInput = z.infer<typeof creditSaleCreateSchema>;
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;
