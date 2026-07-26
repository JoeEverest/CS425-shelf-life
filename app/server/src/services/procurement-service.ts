import type {
	GoodsReceiptCreateInput,
	PurchaseOrderCreateInput,
	PurchaseOrderStatus,
	SupplierCreateInput,
	SupplierUpdateInput,
} from "shared";
import {
	DiscrepancyNeedsConfirmationRepoError,
	InvalidReceiptPaymentRepoError,
	OverReceiptRepoError,
	type ProcurementRepo,
	PurchaseOrderAlreadyReceivedRepoError,
	PurchaseOrderProductArchivedRepoError,
	PurchaseOrderProductNotFoundRepoError,
	PurchaseOrderSupplierArchivedRepoError,
	PurchaseOrderSupplierNotFoundRepoError,
	ReceiptLineNotInPurchaseOrderRepoError,
	ReceiptPurchaseOrderNotFoundRepoError,
	ReceiptStockLevelNotFoundRepoError,
} from "../repos/procurement-repo";
import { DomainError } from "./domain-error";

export class ProcurementService {
	constructor(private readonly procurementRepo: ProcurementRepo) {}

	listSuppliers(includeArchived: boolean) {
		return this.procurementRepo.listSuppliers(includeArchived);
	}

	async createSupplier(input: SupplierCreateInput) {
		const id = await this.procurementRepo.createSupplier(input);
		return this.requireSupplier(id);
	}

	async updateSupplier(id: string, input: SupplierUpdateInput) {
		if (!(await this.procurementRepo.updateSupplier(id, input))) {
			throw new DomainError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
		}
		return this.requireSupplier(id);
	}

	async archiveSupplier(id: string) {
		if (!(await this.procurementRepo.archiveSupplier(id))) {
			throw new DomainError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
		}
		return this.requireSupplier(id);
	}

	async createPurchaseOrder(input: PurchaseOrderCreateInput, actorId: string) {
		try {
			const id = await this.procurementRepo.createPurchaseOrder(input, actorId);
			return this.requirePurchaseOrder(id);
		} catch (error) {
			if (error instanceof PurchaseOrderSupplierNotFoundRepoError) {
				throw new DomainError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
			}
			if (error instanceof PurchaseOrderSupplierArchivedRepoError) {
				throw new DomainError(
					409,
					"SUPPLIER_ARCHIVED",
					"An archived supplier cannot receive purchase orders.",
				);
			}
			if (error instanceof PurchaseOrderProductNotFoundRepoError) {
				throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
			}
			if (error instanceof PurchaseOrderProductArchivedRepoError) {
				throw new DomainError(
					409,
					"PRODUCT_ARCHIVED",
					"An archived product cannot be ordered.",
				);
			}
			throw error;
		}
	}

	listPurchaseOrders(status?: NonNullable<PurchaseOrderStatus>) {
		return this.procurementRepo.listPurchaseOrders(status);
	}

	async getPurchaseOrder(id: string) {
		return this.requirePurchaseOrder(id);
	}

	async receiveDelivery(
		poId: string,
		input: GoodsReceiptCreateInput,
		actorId: string,
		canConfirmDiscrepancy: boolean,
	) {
		if (input.discrepancyConfirmed === true && !canConfirmDiscrepancy) {
			throw new DomainError(
				403,
				"FORBIDDEN",
				"You do not have permission to confirm a delivery discrepancy.",
			);
		}

		try {
			return await this.procurementRepo.receiveDelivery(poId, input, actorId);
		} catch (error) {
			if (error instanceof ReceiptPurchaseOrderNotFoundRepoError) {
				throw new DomainError(
					404,
					"PURCHASE_ORDER_NOT_FOUND",
					"Purchase order not found.",
				);
			}
			if (error instanceof PurchaseOrderAlreadyReceivedRepoError) {
				throw new DomainError(
					409,
					"PO_ALREADY_RECEIVED",
					"This purchase order has already been fully received.",
				);
			}
			if (error instanceof ReceiptLineNotInPurchaseOrderRepoError) {
				throw new DomainError(
					400,
					"PO_LINE_NOT_IN_ORDER",
					`Purchase-order line ${error.poLineId} does not belong to this order.`,
				);
			}
			if (error instanceof OverReceiptRepoError) {
				throw new DomainError(
					409,
					"OVER_RECEIPT",
					`Received quantity exceeds the remaining quantity for line ${error.poLineId}.`,
				);
			}
			if (error instanceof DiscrepancyNeedsConfirmationRepoError) {
				throw new DomainError(
					409,
					"DISCREPANCY_NEEDS_CONFIRMATION",
					"A manager must confirm this delivery discrepancy.",
				);
			}
			if (error instanceof InvalidReceiptPaymentRepoError) {
				throw new DomainError(
					400,
					"INVALID_PAYMENT_AMOUNT",
					"A partial payment must be greater than zero and no more than this receipt's value.",
				);
			}
			if (error instanceof ReceiptStockLevelNotFoundRepoError) {
				throw new DomainError(
					409,
					"PRODUCT_STOCK_NOT_FOUND",
					`Stock level not found for product ${error.productId}.`,
				);
			}
			throw error;
		}
	}

	private async requireSupplier(id: string) {
		const supplier = await this.procurementRepo.findSupplierById(id);
		if (!supplier) {
			throw new DomainError(404, "SUPPLIER_NOT_FOUND", "Supplier not found.");
		}
		return supplier;
	}

	private async requirePurchaseOrder(id: string) {
		const purchaseOrder = await this.procurementRepo.findPurchaseOrderById(id);
		if (!purchaseOrder) {
			throw new DomainError(
				404,
				"PURCHASE_ORDER_NOT_FOUND",
				"Purchase order not found.",
			);
		}
		const lines = await this.procurementRepo.listPurchaseOrderLines(id);
		return { ...purchaseOrder, lines };
	}
}
