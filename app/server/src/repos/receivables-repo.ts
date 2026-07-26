import type { Database } from "db";
import { customerPayments, customers, invoices, sales, users } from "db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type {
	CustomerCreateInput,
	CustomerPaymentCreateInput,
	InvoiceListQuery,
} from "shared";
import { moneyToCents } from "../rules/money";

export class InvoiceNotFoundRepoError extends Error {}
export class InvoiceOverpaymentRepoError extends Error {}

const customerSelection = {
	id: customers.id,
	name: customers.name,
	phone: customers.phone,
	outstandingBalance: customers.outstandingBalance,
	createdAt: customers.createdAt,
};

const invoiceSelection = {
	id: invoices.id,
	customerId: invoices.customerId,
	customerName: customers.name,
	total: invoices.total,
	balance: invoices.balance,
	issuedAt: invoices.issuedAt,
	saleId: invoices.saleId,
};

export class ReceivablesRepo {
	constructor(private readonly database: Database) {}

	listCustomers() {
		return this.database
			.select(customerSelection)
			.from(customers)
			.orderBy(customers.name, customers.id);
	}

	async createCustomer(input: CustomerCreateInput): Promise<string> {
		const [customer] = await this.database
			.insert(customers)
			.values(input)
			.returning({ id: customers.id });
		if (!customer) {
			throw new Error("Failed to create customer.");
		}
		return customer.id;
	}

	async findCustomerById(id: string) {
		const [customer] = await this.database
			.select(customerSelection)
			.from(customers)
			.where(eq(customers.id, id));
		return customer;
	}

	listInvoices(query: InvoiceListQuery) {
		const baseQuery = this.database
			.select(invoiceSelection)
			.from(invoices)
			.innerJoin(customers, eq(customers.id, invoices.customerId));
		if (query.customerId) {
			return baseQuery
				.where(eq(invoices.customerId, query.customerId))
				.orderBy(desc(invoices.issuedAt), desc(invoices.createdAt));
		}
		return baseQuery.orderBy(desc(invoices.issuedAt), desc(invoices.createdAt));
	}

	async findInvoiceById(id: string) {
		const [invoice] = await this.database
			.select(invoiceSelection)
			.from(invoices)
			.innerJoin(customers, eq(customers.id, invoices.customerId))
			.innerJoin(sales, eq(sales.id, invoices.saleId))
			.where(eq(invoices.id, id));
		if (!invoice) {
			return undefined;
		}

		const payments = await this.database
			.select({
				id: customerPayments.id,
				amount: customerPayments.amount,
				paidAt: customerPayments.paidAt,
				recordedBy: customerPayments.recordedBy,
				recordedByName: users.name,
				createdAt: customerPayments.createdAt,
			})
			.from(customerPayments)
			.innerJoin(users, eq(users.id, customerPayments.recordedBy))
			.where(eq(customerPayments.invoiceId, id))
			.orderBy(desc(customerPayments.paidAt), desc(customerPayments.createdAt));

		return { ...invoice, payments };
	}

	async recordPayment(
		invoiceId: string,
		input: CustomerPaymentCreateInput,
		recordedBy: string,
	): Promise<void> {
		await this.database.transaction(async (transaction) => {
			const [invoice] = await transaction
				.select({
					id: invoices.id,
					customerId: invoices.customerId,
					balance: invoices.balance,
				})
				.from(invoices)
				.where(eq(invoices.id, invoiceId))
				.for("update");
			if (!invoice) {
				throw new InvoiceNotFoundRepoError();
			}

			if (moneyToCents(input.amount) > moneyToCents(invoice.balance)) {
				throw new InvoiceOverpaymentRepoError();
			}

			await transaction.insert(customerPayments).values({
				invoiceId,
				amount: input.amount,
				recordedBy,
			});
			await transaction
				.update(invoices)
				.set({ balance: sql`${invoices.balance} - ${input.amount}` })
				.where(eq(invoices.id, invoiceId));
			await transaction
				.update(customers)
				.set({
					outstandingBalance: sql`${customers.outstandingBalance} - ${input.amount}`,
				})
				.where(eq(customers.id, invoice.customerId));
		});
	}
}
