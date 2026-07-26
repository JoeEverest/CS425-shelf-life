import {
	type CategoryCreateInput,
	type CategoryUpdateInput,
	PERMISSIONS,
	type Permission,
	type ProductCreateInput,
	type ProductUpdateInput,
	ROLE_PERMISSIONS,
	type Role,
} from "shared";
import {
	type CatalogRepo,
	CategoryInUseRepoError,
	CategoryReferenceRepoError,
	DuplicateCategoryRepoError,
	DuplicateSkuRepoError,
} from "../repos/catalog-repo";
import { canEditProduct, canPublishProduct } from "../rules/product-state";
import { isValidUnitBreakdown } from "../rules/unit-breakdown";
import { DomainError } from "./domain-error";

function actorPermissions(roles: readonly Role[]): Permission[] {
	return roles.flatMap((role) => [...ROLE_PERMISSIONS[role]]);
}

export class CatalogService {
	constructor(private readonly catalogRepo: CatalogRepo) {}

	listCategories() {
		return this.catalogRepo.listCategories();
	}

	async createCategory(input: CategoryCreateInput) {
		try {
			const category = await this.catalogRepo.createCategory(input);
			if (!category) {
				throw new Error("Failed to create category.");
			}
			return category;
		} catch (error) {
			if (error instanceof DuplicateCategoryRepoError) {
				throw new DomainError(
					409,
					"DUPLICATE_CATEGORY",
					"A category with that name already exists.",
				);
			}
			throw error;
		}
	}

	async updateCategory(id: string, input: CategoryUpdateInput) {
		try {
			const category = await this.catalogRepo.updateCategory(id, input);
			if (!category) {
				throw new DomainError(404, "CATEGORY_NOT_FOUND", "Category not found.");
			}
			return category;
		} catch (error) {
			if (error instanceof DuplicateCategoryRepoError) {
				throw new DomainError(
					409,
					"DUPLICATE_CATEGORY",
					"A category with that name already exists.",
				);
			}
			throw error;
		}
	}

	async deleteCategory(id: string) {
		try {
			if (!(await this.catalogRepo.deleteCategory(id))) {
				throw new DomainError(404, "CATEGORY_NOT_FOUND", "Category not found.");
			}
			return { success: true };
		} catch (error) {
			if (error instanceof CategoryInUseRepoError) {
				throw new DomainError(
					409,
					"CATEGORY_IN_USE",
					"The category is referenced by one or more products.",
				);
			}
			throw error;
		}
	}

	listProducts(includeArchived: boolean) {
		return this.catalogRepo.listProducts(includeArchived);
	}

	async createProduct(input: ProductCreateInput, createdBy: string) {
		if (!isValidUnitBreakdown(input.unitsPerBulk)) {
			throw new DomainError(
				400,
				"VALIDATION",
				"Units per bulk must be a positive integer.",
			);
		}

		try {
			const id = await this.catalogRepo.createProduct(input, createdBy);
			return await this.requireProduct(id);
		} catch (error) {
			this.mapProductWriteError(error);
		}
	}

	async updateProduct(
		id: string,
		input: ProductUpdateInput,
		roles: readonly Role[],
	) {
		const permissions = actorPermissions(roles);
		const current = await this.requireProduct(id);
		if (!canEditProduct(current.published, permissions)) {
			throw new DomainError(
				403,
				"FORBIDDEN",
				"You do not have permission to do that.",
			);
		}

		if (
			input.unitsPerBulk !== undefined &&
			!isValidUnitBreakdown(input.unitsPerBulk)
		) {
			throw new DomainError(
				400,
				"VALIDATION",
				"Units per bulk must be a positive integer.",
			);
		}

		const requireUnpublished = !permissions.includes(
			PERMISSIONS.PRODUCTS_EDIT_PUBLISHED,
		);

		try {
			if (
				!(await this.catalogRepo.updateProduct(id, input, {
					requireUnpublished,
				}))
			) {
				// Zero rows: either the product vanished, or it was published
				// between our check and the guarded write — re-fetch to tell.
				const latest = await this.catalogRepo.findProductById(id);
				if (!latest) {
					throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
				}
				throw new DomainError(
					403,
					"FORBIDDEN",
					"You do not have permission to do that.",
				);
			}
			return await this.requireProduct(id);
		} catch (error) {
			this.mapProductWriteError(error);
		}
	}

	async publishProduct(id: string) {
		const current = await this.requireProduct(id);
		if (current.archived) {
			throw new DomainError(
				409,
				"PRODUCT_ARCHIVED",
				"An archived product cannot be published.",
			);
		}
		if (!canPublishProduct(current.published)) {
			throw new DomainError(
				409,
				"ALREADY_PUBLISHED",
				"Product is already published.",
			);
		}

		const result = await this.catalogRepo.publishProduct(id);
		if (result === "already") {
			throw new DomainError(
				409,
				"ALREADY_PUBLISHED",
				"Product is already published.",
			);
		}
		if (result === "archived") {
			throw new DomainError(
				409,
				"PRODUCT_ARCHIVED",
				"An archived product cannot be published.",
			);
		}
		if (result === "missing") {
			throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
		}
		return this.requireProduct(id);
	}

	async archiveProduct(id: string) {
		if (!(await this.catalogRepo.archiveProduct(id))) {
			throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
		}
		return this.requireProduct(id);
	}

	private async requireProduct(id: string) {
		const product = await this.catalogRepo.findProductById(id);
		if (!product) {
			throw new DomainError(404, "PRODUCT_NOT_FOUND", "Product not found.");
		}
		return product;
	}

	private mapProductWriteError(error: unknown): never {
		if (error instanceof DuplicateSkuRepoError) {
			throw new DomainError(
				409,
				"DUPLICATE_SKU",
				"A product with that SKU already exists.",
			);
		}
		if (error instanceof CategoryReferenceRepoError) {
			throw new DomainError(404, "CATEGORY_NOT_FOUND", "Category not found.");
		}
		throw error;
	}
}
