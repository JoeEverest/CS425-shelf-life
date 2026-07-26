import type {
	PurchaseOrderCreateInput,
	PurchaseOrderStatus,
	SupplierCreateInput,
	SupplierUpdateInput,
} from "shared";
import {
	type ProcurementRepo,
	PurchaseOrderProductArchivedRepoError,
	PurchaseOrderProductNotFoundRepoError,
	PurchaseOrderSupplierArchivedRepoError,
	PurchaseOrderSupplierNotFoundRepoError,
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
