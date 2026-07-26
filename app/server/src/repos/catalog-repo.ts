import type { Database } from "db";
import { categories, products, stockLevels } from "db/schema";
import { and, asc, eq } from "drizzle-orm";
import type {
	CategoryCreateInput,
	CategoryUpdateInput,
	ProductCreateInput,
	ProductUpdateInput,
} from "shared";
import { isDatabaseError } from "./database-errors";

export class DuplicateCategoryRepoError extends Error {}
export class CategoryInUseRepoError extends Error {}
export class DuplicateSkuRepoError extends Error {}
export class CategoryReferenceRepoError extends Error {}

const productSelection = {
	id: products.id,
	sku: products.sku,
	name: products.name,
	categoryId: products.categoryId,
	categoryName: categories.name,
	bulkUnitName: products.bulkUnitName,
	unitsPerBulk: products.unitsPerBulk,
	saleUnitName: products.saleUnitName,
	bulkCost: products.bulkCost,
	price: products.price,
	published: products.published,
	archived: products.archived,
	createdBy: products.createdBy,
	createdAt: products.createdAt,
	qtyUnits: stockLevels.qtyUnits,
};

export class CatalogRepo {
	constructor(private readonly database: Database) {}

	async listCategories() {
		return this.database
			.select({
				id: categories.id,
				name: categories.name,
				createdAt: categories.createdAt,
			})
			.from(categories)
			.orderBy(asc(categories.name));
	}

	async createCategory(input: CategoryCreateInput) {
		try {
			const [category] = await this.database
				.insert(categories)
				.values(input)
				.returning({
					id: categories.id,
					name: categories.name,
					createdAt: categories.createdAt,
				});
			return category;
		} catch (error) {
			if (isDatabaseError(error, "23505", "categories_name_unique")) {
				throw new DuplicateCategoryRepoError();
			}
			throw error;
		}
	}

	async updateCategory(id: string, input: CategoryUpdateInput) {
		try {
			const [category] = await this.database
				.update(categories)
				.set(input)
				.where(eq(categories.id, id))
				.returning({
					id: categories.id,
					name: categories.name,
					createdAt: categories.createdAt,
				});
			return category;
		} catch (error) {
			if (isDatabaseError(error, "23505", "categories_name_unique")) {
				throw new DuplicateCategoryRepoError();
			}
			throw error;
		}
	}

	async deleteCategory(id: string): Promise<boolean> {
		try {
			const deleted = await this.database
				.delete(categories)
				.where(eq(categories.id, id))
				.returning({ id: categories.id });
			return deleted.length > 0;
		} catch (error) {
			if (
				isDatabaseError(error, "23503", "products_category_id_categories_id_fk")
			) {
				throw new CategoryInUseRepoError();
			}
			throw error;
		}
	}

	async listProducts(includeArchived: boolean) {
		const baseQuery = this.database
			.select(productSelection)
			.from(products)
			.innerJoin(categories, eq(categories.id, products.categoryId))
			.innerJoin(stockLevels, eq(stockLevels.productId, products.id));

		if (includeArchived) {
			return baseQuery.orderBy(asc(products.name));
		}

		return baseQuery
			.where(eq(products.archived, false))
			.orderBy(asc(products.name));
	}

	async findProductById(id: string) {
		const [product] = await this.database
			.select(productSelection)
			.from(products)
			.innerJoin(categories, eq(categories.id, products.categoryId))
			.innerJoin(stockLevels, eq(stockLevels.productId, products.id))
			.where(eq(products.id, id));
		return product;
	}

	async createProduct(input: ProductCreateInput, createdBy: string) {
		try {
			return await this.database.transaction(async (transaction) => {
				const [product] = await transaction
					.insert(products)
					.values({ ...input, createdBy })
					.returning({ id: products.id });

				if (!product) {
					throw new Error("Failed to create product.");
				}

				await transaction
					.insert(stockLevels)
					.values({ productId: product.id, qtyUnits: 0 });
				return product.id;
			});
		} catch (error) {
			if (isDatabaseError(error, "23505", "products_sku_unique")) {
				throw new DuplicateSkuRepoError();
			}
			if (
				isDatabaseError(error, "23503", "products_category_id_categories_id_fk")
			) {
				throw new CategoryReferenceRepoError();
			}
			throw error;
		}
	}

	async updateProduct(
		id: string,
		input: ProductUpdateInput,
		options: { requireUnpublished: boolean },
	): Promise<boolean> {
		try {
			// The published predicate travels WITH the write so a concurrent
			// publish cannot slip a clerk edit onto a published row (TOCTOU).
			const updated = await this.database
				.update(products)
				.set(input)
				.where(
					options.requireUnpublished
						? and(eq(products.id, id), eq(products.published, false))
						: eq(products.id, id),
				)
				.returning({ id: products.id });
			return updated.length > 0;
		} catch (error) {
			if (isDatabaseError(error, "23505", "products_sku_unique")) {
				throw new DuplicateSkuRepoError();
			}
			if (
				isDatabaseError(error, "23503", "products_category_id_categories_id_fk")
			) {
				throw new CategoryReferenceRepoError();
			}
			throw error;
		}
	}

	async publishProduct(
		id: string,
	): Promise<"published" | "already" | "archived" | "missing"> {
		const published = await this.database
			.update(products)
			.set({ published: true })
			.where(
				and(
					eq(products.id, id),
					eq(products.published, false),
					eq(products.archived, false),
				),
			)
			.returning({ id: products.id });

		if (published.length > 0) {
			return "published";
		}

		const [existing] = await this.database
			.select({ published: products.published, archived: products.archived })
			.from(products)
			.where(eq(products.id, id));

		if (!existing) {
			return "missing";
		}
		return existing.archived ? "archived" : "already";
	}

	async archiveProduct(id: string): Promise<boolean> {
		const archived = await this.database
			.update(products)
			.set({ archived: true })
			.where(eq(products.id, id))
			.returning({ id: products.id });
		return archived.length > 0;
	}
}
