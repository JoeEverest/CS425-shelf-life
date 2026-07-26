import type { StockAdjustmentInput } from "shared";
import {
	InsufficientStockRepoError,
	type InventoryRepo,
	ProductStockNotFoundRepoError,
} from "../repos/inventory-repo";
import { isValidAdjustment } from "../rules/adjustment";
import { calculateStockVelocity } from "../rules/stock-velocity";
import { DomainError } from "./domain-error";

export class InventoryService {
	constructor(private readonly inventoryRepo: InventoryRepo) {}

	listStock(includeArchived: boolean) {
		return this.inventoryRepo.listStock(includeArchived);
	}

	async listStockAlerts() {
		const rows = await this.inventoryRepo.listStockAlertInputs();
		return rows
			.map((row) => {
				const result = calculateStockVelocity({
					qtyUnits: row.qtyUnits,
					unitsSoldInWindow: row.unitsSoldInWindow,
					windowDays: row.windowDays,
					coverDays: row.coverDays,
				});
				return {
					productId: row.productId,
					sku: row.sku,
					name: row.name,
					qtyUnits: row.qtyUnits,
					saleUnitName: row.saleUnitName,
					velocityPerDay: result.velocityPerDay.toFixed(4),
					daysToStockout: result.daysToStockout?.toFixed(1) ?? null,
					low: result.low,
					hasHistory: row.movementCount > 0,
					_sortDaysToStockout: result.daysToStockout,
				};
			})
			.sort((left, right) => {
				if (left.low !== right.low) {
					return left.low ? -1 : 1;
				}
				if (left._sortDaysToStockout === null) {
					return right._sortDaysToStockout === null ? 0 : 1;
				}
				if (right._sortDaysToStockout === null) {
					return -1;
				}
				return left._sortDaysToStockout - right._sortDaysToStockout;
			})
			.map(({ _sortDaysToStockout, ...alert }) => alert);
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
