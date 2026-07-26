import { z } from "zod";

export const dashboardQuerySchema = z
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

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
