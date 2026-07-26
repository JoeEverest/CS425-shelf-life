import type { PriceUpdateInput } from "shared";
import type { CatalogRepo } from "../repos/catalog-repo";
import {
	PriceProductArchivedRepoError,
	PriceProductNotFoundRepoError,
	type PricingRepo,
} from "../repos/pricing-repo";
import { DomainError } from "./domain-error";

export class PricingService {
	constructor(
		private readonly pricingRepo: PricingRepo,
		private readonly catalogRepo: CatalogRepo,
	) {}

	async setPrice(id: string, input: PriceUpdateInput, actorId: string) {
		try {
			await this.pricingRepo.setPrice(id, input.price, actorId);
			const product = await this.catalogRepo.findProductById(id);
			if (!product) {
				throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
			}
			return product;
		} catch (error) {
			if (error instanceof PriceProductNotFoundRepoError) {
				throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
			}
			if (error instanceof PriceProductArchivedRepoError) {
				throw new DomainError(
					409,
					"PRODUCT_ARCHIVED",
					"An archived product cannot be repriced.",
				);
			}
			throw error;
		}
	}

	async listPriceHistory(productId: string) {
		if (!(await this.pricingRepo.productExists(productId))) {
			throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
		}
		return this.pricingRepo.listPriceHistory(productId);
	}
}
