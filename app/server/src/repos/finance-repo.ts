import type { Database } from "db";
import { expenses, saleLines, sales } from "db/schema";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type {
	ExpenseCreateInput,
	ExpenseListQuery,
	ExpenseUpdateInput,
	PeriodQuery,
} from "shared";

const expenseSelection = {
	id: expenses.id,
	category: expenses.category,
	amount: expenses.amount,
	incurredOn: expenses.incurredOn,
	note: expenses.note,
	recordedBy: expenses.recordedBy,
	createdAt: expenses.createdAt,
};

export class FinanceRepo {
	constructor(private readonly database: Database) {}

	listExpenses(period: ExpenseListQuery) {
		const query = this.database.select(expenseSelection).from(expenses);
		if (period.from && period.to) {
			return query
				.where(
					and(
						gte(expenses.incurredOn, period.from),
						lt(expenses.incurredOn, period.to),
					),
				)
				.orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));
		}
		return query.orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));
	}

	async findExpenseById(id: string) {
		const [expense] = await this.database
			.select(expenseSelection)
			.from(expenses)
			.where(eq(expenses.id, id));
		return expense;
	}

	async createExpense(
		input: ExpenseCreateInput,
		recordedBy: string,
	): Promise<string> {
		const [expense] = await this.database
			.insert(expenses)
			.values({ ...input, recordedBy })
			.returning({ id: expenses.id });
		if (!expense) {
			throw new Error("Failed to create expense.");
		}
		return expense.id;
	}

	async updateExpense(id: string, input: ExpenseUpdateInput): Promise<boolean> {
		const updated = await this.database
			.update(expenses)
			.set(input)
			.where(eq(expenses.id, id))
			.returning({ id: expenses.id });
		return updated.length > 0;
	}

	async deleteExpense(id: string): Promise<boolean> {
		const deleted = await this.database
			.delete(expenses)
			.where(eq(expenses.id, id))
			.returning({ id: expenses.id });
		return deleted.length > 0;
	}

	async financialReport(period: PeriodQuery) {
		const fromUtc = sql`(${period.from}::date::timestamp at time zone 'UTC')`;
		const toUtc = sql`(${period.to}::date::timestamp at time zone 'UTC')`;

		const [revenueRow] = await this.database
			.select({
				revenue: sql<string>`coalesce(sum(${sales.total}), 0)::numeric(12,2)`,
			})
			.from(sales)
			.where(sql`${sales.soldAt} >= ${fromUtc} and ${sales.soldAt} < ${toUtc}`);

		const [cogsRow] = await this.database
			.select({
				cogs: sql<string>`coalesce(sum(${saleLines.lineCogs}), 0)::numeric(12,2)`,
			})
			.from(saleLines)
			.innerJoin(sales, eq(sales.id, saleLines.saleId))
			.where(sql`${sales.soldAt} >= ${fromUtc} and ${sales.soldAt} < ${toUtc}`);

		const [expenseTotalRow] = await this.database
			.select({
				expensesTotal: sql<string>`coalesce(sum(${expenses.amount}), 0)::numeric(12,2)`,
			})
			.from(expenses)
			.where(
				sql`${expenses.incurredOn} >= ${period.from}::date and ${expenses.incurredOn} < ${period.to}::date`,
			);

		const categoryRows = await this.database
			.select({
				category: expenses.category,
				amount: sql<string>`coalesce(sum(${expenses.amount}), 0)::numeric(12,2)`,
			})
			.from(expenses)
			.where(
				sql`${expenses.incurredOn} >= ${period.from}::date and ${expenses.incurredOn} < ${period.to}::date`,
			)
			.groupBy(expenses.category)
			.orderBy(asc(expenses.category));

		const revenue = revenueRow?.revenue ?? "0.00";
		const cogs = cogsRow?.cogs ?? "0.00";
		const expensesTotal = expenseTotalRow?.expensesTotal ?? "0.00";
		const expensesByCategory: Record<string, string> = {};
		for (const row of categoryRows) {
			expensesByCategory[row.category] = row.amount;
		}
		const [profitRow] = await this.database
			.select({
				grossProfit: sql<string>`(${revenue}::numeric - ${cogs}::numeric)::numeric(12,2)`,
				netProfit: sql<string>`(${revenue}::numeric - ${cogs}::numeric - ${expensesTotal}::numeric)::numeric(12,2)`,
			})
			.from(sql`(select 1) as calculation`);

		return {
			revenue,
			cogs,
			grossProfit: profitRow?.grossProfit ?? "0.00",
			expensesTotal,
			expensesByCategory,
			netProfit: profitRow?.netProfit ?? "0.00",
		};
	}
}
