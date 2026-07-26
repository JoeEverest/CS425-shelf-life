import type {
	ExpenseCreateInput,
	ExpenseListQuery,
	ExpenseUpdateInput,
	PeriodQuery,
} from "shared";
import type { FinanceRepo } from "../repos/finance-repo";
import { DomainError } from "./domain-error";

export class FinanceService {
	constructor(private readonly financeRepo: FinanceRepo) {}

	listExpenses(period: ExpenseListQuery) {
		return this.financeRepo.listExpenses(period);
	}

	async createExpense(input: ExpenseCreateInput, actorId: string) {
		const id = await this.financeRepo.createExpense(input, actorId);
		return this.requireExpense(id);
	}

	async updateExpense(id: string, input: ExpenseUpdateInput) {
		if (!(await this.financeRepo.updateExpense(id, input))) {
			throw new DomainError(404, "EXPENSE_NOT_FOUND", "Expense not found.");
		}
		return this.requireExpense(id);
	}

	async deleteExpense(id: string) {
		if (!(await this.financeRepo.deleteExpense(id))) {
			throw new DomainError(404, "EXPENSE_NOT_FOUND", "Expense not found.");
		}
		return { success: true };
	}

	financialReport(period: PeriodQuery) {
		return this.financeRepo.financialReport(period);
	}

	private async requireExpense(id: string) {
		const expense = await this.financeRepo.findExpenseById(id);
		if (!expense) {
			throw new DomainError(404, "EXPENSE_NOT_FOUND", "Expense not found.");
		}
		return expense;
	}
}
