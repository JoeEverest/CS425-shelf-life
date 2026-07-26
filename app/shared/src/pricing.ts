import { z } from "zod";

export const priceUpdateSchema = z
	.object({
		price: z
			.string()
			.regex(
				/^\d{1,10}\.\d{2}$/,
				"Money must be a non-negative string with two decimal places.",
			),
	})
	.strict();

export type PriceUpdateInput = z.infer<typeof priceUpdateSchema>;
