import { z } from "zod";

const requiredText = z.string().trim().min(1);
const money = z
	.string()
	.regex(
		/^\d{1,10}\.\d{2}$/,
		"Money must be a non-negative string with two decimal places.",
	);
const positiveMoney = money.refine((value) => !/^0+\.00$/.test(value), {
	message: "Amount must be greater than zero.",
});

export const customerCreateSchema = z
	.object({
		name: requiredText,
		phone: requiredText.optional(),
	})
	.strict();

export const invoiceListQuerySchema = z
	.object({
		customerId: z.string().uuid().optional(),
	})
	.strict();

export const customerPaymentCreateSchema = z
	.object({
		amount: positiveMoney,
	})
	.strict();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type CustomerPaymentCreateInput = z.infer<
	typeof customerPaymentCreateSchema
>;
