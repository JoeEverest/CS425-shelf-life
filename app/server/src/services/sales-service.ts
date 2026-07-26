import type { CashSaleCreateInput, SalesListQuery } from "shared";
import {
	ProductNotSellableRepoError,
	SaleInsufficientStockRepoError,
	type SalesRepo,
} from "../repos/sales-repo";
import { hasDuplicateProducts } from "../rules/sale";
import { DomainError } from "./domain-error";

export class SalesService {
	constructor(private readonly salesRepo: SalesRepo) {}

	async createCashSale(input: CashSaleCreateInput, clerkId: string) {
		if (hasDuplicateProducts(input.lines)) {
			throw new DomainError(
				400,
				"DUPLICATE_LINE",
				"Each product may appear only once in a sale.",
			);
		}

		try {
			const id = await this.salesRepo.createCashSale(input, clerkId);
			return this.requireSale(id);
		} catch (error) {
			if (error instanceof ProductNotSellableRepoError) {
				const identity = error.sku
					? `${error.productName ?? "Product"} (${error.sku}, ${error.productId})`
					: error.productId;
				throw new DomainError(
					409,
					"PRODUCT_NOT_SELLABLE",
					`Product ${identity} is not sellable.`,
				);
			}
			if (error instanceof SaleInsufficientStockRepoError) {
				throw new DomainError(
					409,
					"INSUFFICIENT_STOCK",
					`Insufficient stock for product ${error.productId}.`,
				);
			}
			throw error;
		}
	}

	listSales(period: SalesListQuery) {
		return this.salesRepo.listSales(period);
	}

	getSale(id: string) {
		return this.requireSale(id);
	}

	private async requireSale(id: string) {
		const sale = await this.salesRepo.findSaleById(id);
		if (!sale) {
			throw new DomainError(404, "SALE_NOT_FOUND", "Sale not found.");
		}
		return sale;
	}
}
