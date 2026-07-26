import { z } from "zod";

export const EXPENSE_CATEGORIES = [
	"rent",
	"transport",
	"delivery",
	"salaries",
	"utilities",
] as const;

const money = z
	.string()
	.regex(
		/^\d{1,10}\.\d{2}$/,
		"Money must be a non-negative string with two decimal places.",
	);
const positiveMoney = money.refine((value) => !/^0+\.00$/.test(value), {
	message: "Amount must be greater than zero.",
});
const note = z.string().trim().min(1);

export const periodQuerySchema = z
	.object({
		from: z.iso.date(),
		to: z.iso.date(),
	})
	.strict()
	.refine((period) => period.from < period.to, {
		message: "The from date must be before the to date.",
		path: ["to"],
	});

export const expenseListQuerySchema = z
	.object({
		from: z.iso.date().optional(),
		to: z.iso.date().optional(),
	})
	.strict()
	.refine(
		(period) =>
			(period.from === undefined && period.to === undefined) ||
			(period.from !== undefined && period.to !== undefined),
		{
			message: "The from and to dates must be provided together.",
			path: ["to"],
		},
	)
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

export const expenseCreateSchema = z
	.object({
		category: z.enum(EXPENSE_CATEGORIES),
		amount: positiveMoney,
		incurredOn: z.iso.date(),
		note: note.optional(),
	})
	.strict();

export const expenseUpdateSchema = z
	.object({
		category: z.enum(EXPENSE_CATEGORIES).optional(),
		amount: positiveMoney.optional(),
		incurredOn: z.iso.date().optional(),
		note: note.nullable().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one expense field is required.",
	});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
