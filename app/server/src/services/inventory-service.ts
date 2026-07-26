import type { StockAdjustmentInput } from "shared";
import {
	InsufficientStockRepoError,
	type InventoryRepo,
	ProductStockNotFoundRepoError,
} from "../repos/inventory-repo";
import { isValidAdjustment } from "../rules/adjustment";
import { DomainError } from "./domain-error";

export class InventoryService {
	constructor(private readonly inventoryRepo: InventoryRepo) {}

	listStock(includeArchived: boolean) {
		return this.inventoryRepo.listStock(includeArchived);
	}

	async adjustStock(input: StockAdjustmentInput, actorId: string) {
		if (!isValidAdjustment(input)) {
			throw new DomainError(
				400,
				"VALIDATION",
				"Adjustment requires a nonzero integer delta and a note of at least three characters.",
			);
		}

		try {
			return await this.inventoryRepo.adjustStock(input, actorId);
		} catch (error) {
			if (error instanceof InsufficientStockRepoError) {
				throw new DomainError(
					409,
					"INSUFFICIENT_STOCK",
					"The adjustment would make stock negative.",
				);
			}
			if (error instanceof ProductStockNotFoundRepoError) {
				throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
			}
			throw error;
		}
	}

	listMovements(productId: string) {
		return this.inventoryRepo.listMovements(productId);
	}
}
