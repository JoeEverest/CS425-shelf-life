import type {
	CustomerCreateInput,
	CustomerPaymentCreateInput,
	InvoiceListQuery,
} from "shared";
import {
	InvoiceNotFoundRepoError,
	InvoiceOverpaymentRepoError,
	type ReceivablesRepo,
} from "../repos/receivables-repo";
import { DomainError } from "./domain-error";

export class ReceivablesService {
	constructor(private readonly receivablesRepo: ReceivablesRepo) {}

	listCustomers() {
		return this.receivablesRepo.listCustomers();
	}

	async createCustomer(input: CustomerCreateInput) {
		const id = await this.receivablesRepo.createCustomer(input);
		return this.requireCustomer(id);
	}

	getCustomer(id: string) {
		return this.requireCustomer(id);
	}

	listInvoices(query: InvoiceListQuery) {
		return this.receivablesRepo.listInvoices(query);
	}

	getInvoice(id: string) {
		return this.requireInvoice(id);
	}

	async recordPayment(
		invoiceId: string,
		input: CustomerPaymentCreateInput,
		recordedBy: string,
	) {
		try {
			await this.receivablesRepo.recordPayment(invoiceId, input, recordedBy);
		} catch (error) {
			if (error instanceof InvoiceNotFoundRepoError) {
				throw new DomainError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
			}
			if (error instanceof InvoiceOverpaymentRepoError) {
				throw new DomainError(
					409,
					"OVERPAYMENT",
					"Payment exceeds the invoice balance.",
				);
			}
			throw error;
		}
		return this.requireInvoice(invoiceId);
	}

	private async requireCustomer(id: string) {
		const customer = await this.receivablesRepo.findCustomerById(id);
		if (!customer) {
			throw new DomainError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
		}
		return customer;
	}

	private async requireInvoice(id: string) {
		const invoice = await this.receivablesRepo.findInvoiceById(id);
		if (!invoice) {
			throw new DomainError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
		}
		return invoice;
	}
}
