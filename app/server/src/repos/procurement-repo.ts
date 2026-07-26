import type { Database } from "db";
import { poLines, products, purchaseOrders, suppliers } from "db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
	PurchaseOrderCreateInput,
	PurchaseOrderStatus,
	SupplierCreateInput,
	SupplierUpdateInput,
} from "shared";

export class PurchaseOrderSupplierNotFoundRepoError extends Error {}
export class PurchaseOrderSupplierArchivedRepoError extends Error {}
export class PurchaseOrderProductNotFoundRepoError extends Error {}
export class PurchaseOrderProductArchivedRepoError extends Error {}

const supplierSelection = {
	id: suppliers.id,
	name: suppliers.name,
	phone: suppliers.phone,
	note: suppliers.note,
	outstandingBalance: suppliers.outstandingBalance,
	archived: suppliers.archived,
	createdAt: suppliers.createdAt,
};

const purchaseOrderSelection = {
	id: purchaseOrders.id,
	supplierId: purchaseOrders.supplierId,
	supplierName: suppliers.name,
	status: purchaseOrders.status,
	createdBy: purchaseOrders.createdBy,
	createdAt: purchaseOrders.createdAt,
};

export class ProcurementRepo {
	constructor(private readonly database: Database) {}

	listSuppliers(includeArchived: boolean) {
		const query = this.database.select(supplierSelection).from(suppliers);
		if (includeArchived) {
			return query.orderBy(asc(suppliers.name));
		}
		return query
			.where(eq(suppliers.archived, false))
			.orderBy(asc(suppliers.name));
	}

	async findSupplierById(id: string) {
		const [supplier] = await this.database
			.select(supplierSelection)
			.from(suppliers)
			.where(eq(suppliers.id, id));
		return supplier;
	}

	async createSupplier(input: SupplierCreateInput): Promise<string> {
		const [supplier] = await this.database
			.insert(suppliers)
			.values(input)
			.returning({ id: suppliers.id });
		if (!supplier) {
			throw new Error("Failed to create supplier.");
		}
		return supplier.id;
	}

	async updateSupplier(
		id: string,
		input: SupplierUpdateInput,
	): Promise<boolean> {
		const updated = await this.database
			.update(suppliers)
			.set(input)
			.where(eq(suppliers.id, id))
			.returning({ id: suppliers.id });
		return updated.length > 0;
	}

	async archiveSupplier(id: string): Promise<boolean> {
		const archived = await this.database
			.update(suppliers)
			.set({ archived: true })
			.where(eq(suppliers.id, id))
			.returning({ id: suppliers.id });
		return archived.length > 0;
	}

	async createPurchaseOrder(
		input: PurchaseOrderCreateInput,
		actorId: string,
	): Promise<string> {
		return this.database.transaction(async (transaction) => {
			const [supplier] = await transaction
				.select({ archived: suppliers.archived })
				.from(suppliers)
				.where(eq(suppliers.id, input.supplierId))
				.for("share");

			if (!supplier) {
				throw new PurchaseOrderSupplierNotFoundRepoError();
			}
			if (supplier.archived) {
				throw new PurchaseOrderSupplierArchivedRepoError();
			}

			const productIds = [
				...new Set(input.lines.map((line) => line.productId)),
			];
			const productRows = await transaction
				.select({
					id: products.id,
					bulkCost: products.bulkCost,
					archived: products.archived,
				})
				.from(products)
				.where(inArray(products.id, productIds))
				.for("share");
			const productsById = new Map(
				productRows.map((product) => [product.id, product] as const),
			);

			const lineValues = input.lines.map((line) => {
				const product = productsById.get(line.productId);
				if (!product) {
					throw new PurchaseOrderProductNotFoundRepoError();
				}
				if (product.archived) {
					throw new PurchaseOrderProductArchivedRepoError();
				}
				return {
					productId: line.productId,
					qtyBulk: line.qtyBulk,
					bulkCostAtOrder: product.bulkCost,
				};
			});

			const [purchaseOrder] = await transaction
				.insert(purchaseOrders)
				.values({
					supplierId: input.supplierId,
					status: "open",
					createdBy: actorId,
				})
				.returning({ id: purchaseOrders.id });

			if (!purchaseOrder) {
				throw new Error("Failed to create purchase order.");
			}

			await transaction.insert(poLines).values(
				lineValues.map((line) => ({
					poId: purchaseOrder.id,
					...line,
				})),
			);
			return purchaseOrder.id;
		});
	}

	listPurchaseOrders(status?: NonNullable<PurchaseOrderStatus>) {
		const query = this.database
			.select({
				...purchaseOrderSelection,
				lineCount: sql<number>`count(${poLines.id})::int`,
				totalValue: sql<string>`coalesce(sum(${poLines.qtyBulk} * ${poLines.bulkCostAtOrder}), 0)::numeric(12,2)`,
			})
			.from(purchaseOrders)
			.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
			.leftJoin(poLines, eq(poLines.poId, purchaseOrders.id))
			.groupBy(purchaseOrders.id, suppliers.id);

		if (status) {
			return query
				.where(eq(purchaseOrders.status, status))
				.orderBy(desc(purchaseOrders.createdAt));
		}
		return query.orderBy(desc(purchaseOrders.createdAt));
	}

	async findPurchaseOrderById(id: string) {
		const [purchaseOrder] = await this.database
			.select(purchaseOrderSelection)
			.from(purchaseOrders)
			.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
			.where(eq(purchaseOrders.id, id));
		return purchaseOrder;
	}

	listPurchaseOrderLines(poId: string) {
		return this.database
			.select({
				id: poLines.id,
				productId: poLines.productId,
				productName: products.name,
				sku: products.sku,
				bulkUnitName: products.bulkUnitName,
				qtyBulk: poLines.qtyBulk,
				bulkCostAtOrder: poLines.bulkCostAtOrder,
				createdAt: poLines.createdAt,
			})
			.from(poLines)
			.innerJoin(products, eq(products.id, poLines.productId))
			.where(eq(poLines.poId, poId))
			.orderBy(asc(poLines.createdAt), asc(poLines.id));
	}
}
