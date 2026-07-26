import type { Database } from "db";
import {
	goodsReceipts,
	poLines,
	products,
	purchaseOrders,
	receiptLines,
	stockLevels,
	stockMovements,
	supplierPayments,
	suppliers,
} from "db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
	GoodsReceiptCreateInput,
	PurchaseOrderCreateInput,
	PurchaseOrderStatus,
	SupplierCreateInput,
	SupplierUpdateInput,
} from "shared";
import { isFlaggedDiscrepancy, resolveReceiptPayment } from "../rules/delivery";
import { centsToMoney, moneyToCents } from "../rules/money";

export class PurchaseOrderSupplierNotFoundRepoError extends Error {}
export class PurchaseOrderSupplierArchivedRepoError extends Error {}
export class PurchaseOrderProductNotFoundRepoError extends Error {}
export class PurchaseOrderProductArchivedRepoError extends Error {}
export class ReceiptPurchaseOrderNotFoundRepoError extends Error {}
export class PurchaseOrderAlreadyReceivedRepoError extends Error {}
export class ReceiptLineNotInPurchaseOrderRepoError extends Error {
	constructor(readonly poLineId: string) {
		super("Receipt line does not belong to the purchase order.");
	}
}
export class OverReceiptRepoError extends Error {
	constructor(readonly poLineId: string) {
		super("Received quantity exceeds the remaining ordered quantity.");
	}
}
export class DiscrepancyNeedsConfirmationRepoError extends Error {}
export class InvalidReceiptPaymentRepoError extends Error {}
export class ReceiptStockLevelNotFoundRepoError extends Error {
	constructor(readonly productId: string) {
		super("Product stock level not found.");
	}
}

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

const receivedSoFar = sql<number>`coalesce((
	select sum(${receiptLines.qtyBulkReceived})
	from ${receiptLines}
	where ${receiptLines.poLineId} = ${poLines.id}
), 0)::int`;

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
				receivedSoFar,
				remaining: sql<number>`(${poLines.qtyBulk} - ${receivedSoFar})::int`,
				bulkCostAtOrder: poLines.bulkCostAtOrder,
				createdAt: poLines.createdAt,
			})
			.from(poLines)
			.innerJoin(products, eq(products.id, poLines.productId))
			.where(eq(poLines.poId, poId))
			.orderBy(asc(poLines.createdAt), asc(poLines.id));
	}

	async receiveDelivery(
		poId: string,
		input: GoodsReceiptCreateInput,
		actorId: string,
	) {
		return this.database.transaction(async (transaction) => {
			const [purchaseOrder] = await transaction
				.select({
					id: purchaseOrders.id,
					supplierId: purchaseOrders.supplierId,
					status: purchaseOrders.status,
				})
				.from(purchaseOrders)
				.where(eq(purchaseOrders.id, poId))
				.for("update");
			if (!purchaseOrder) {
				throw new ReceiptPurchaseOrderNotFoundRepoError();
			}
			if (purchaseOrder.status === "received") {
				throw new PurchaseOrderAlreadyReceivedRepoError();
			}

			const orderLines = await transaction
				.select({
					id: poLines.id,
					productId: poLines.productId,
					qtyBulk: poLines.qtyBulk,
					bulkCostAtOrder: poLines.bulkCostAtOrder,
					unitsPerBulk: products.unitsPerBulk,
				})
				.from(poLines)
				.innerJoin(products, eq(products.id, poLines.productId))
				.where(eq(poLines.poId, poId))
				.orderBy(asc(poLines.id))
				.for("share");

			const receivedRows =
				orderLines.length === 0
					? []
					: await transaction
							.select({
								poLineId: receiptLines.poLineId,
								qtyBulkReceived: sql<number>`sum(${receiptLines.qtyBulkReceived})::int`,
							})
							.from(receiptLines)
							.where(
								inArray(
									receiptLines.poLineId,
									orderLines.map((line) => line.id),
								),
							)
							.groupBy(receiptLines.poLineId);
			const receivedByLineId = new Map(
				receivedRows.map(
					(line) => [line.poLineId, line.qtyBulkReceived] as const,
				),
			);
			const orderLinesById = new Map(
				orderLines.map((line) => [line.id, line] as const),
			);

			// A discrepancy is flagged by the receiver, not inferred from a
			// short quantity — a planned partial delivery is normal.
			const hasDiscrepancy = isFlaggedDiscrepancy(input.discrepancyNote);
			let receivedValueCents = 0n;
			for (const inputLine of input.lines) {
				const orderLine = orderLinesById.get(inputLine.poLineId);
				if (!orderLine) {
					throw new ReceiptLineNotInPurchaseOrderRepoError(inputLine.poLineId);
				}

				const remaining =
					orderLine.qtyBulk - (receivedByLineId.get(orderLine.id) ?? 0);
				if (inputLine.qtyBulkReceived > remaining) {
					throw new OverReceiptRepoError(inputLine.poLineId);
				}
				receivedValueCents +=
					moneyToCents(orderLine.bulkCostAtOrder) *
					BigInt(inputLine.qtyBulkReceived);
			}

			if (hasDiscrepancy && input.discrepancyConfirmed !== true) {
				throw new DiscrepancyNeedsConfirmationRepoError();
			}

			const payment = resolveReceiptPayment(receivedValueCents, input.payment);
			if (!payment) {
				throw new InvalidReceiptPaymentRepoError();
			}

			const signedOffAt = new Date();
			const [receipt] = await transaction
				.insert(goodsReceipts)
				.values({
					poId,
					receivedBy: actorId,
					signedOffAt,
					discrepancyNote: hasDiscrepancy ? input.discrepancyNote : undefined,
					discrepancyConfirmedBy: hasDiscrepancy ? actorId : undefined,
				})
				.returning({
					id: goodsReceipts.id,
					createdAt: goodsReceipts.createdAt,
				});
			if (!receipt) {
				throw new Error("Failed to create goods receipt.");
			}

			for (const inputLine of input.lines) {
				const orderLine = orderLinesById.get(inputLine.poLineId);
				if (!orderLine) {
					throw new ReceiptLineNotInPurchaseOrderRepoError(inputLine.poLineId);
				}
				await transaction.insert(receiptLines).values({
					receiptId: receipt.id,
					poLineId: inputLine.poLineId,
					qtyBulkReceived: inputLine.qtyBulkReceived,
				});

				const deltaUnits = inputLine.qtyBulkReceived * orderLine.unitsPerBulk;
				const [stockLevel] = await transaction
					.update(stockLevels)
					.set({ qtyUnits: sql`${stockLevels.qtyUnits} + ${deltaUnits}` })
					.where(eq(stockLevels.productId, orderLine.productId))
					.returning({ productId: stockLevels.productId });
				if (!stockLevel) {
					throw new ReceiptStockLevelNotFoundRepoError(orderLine.productId);
				}

				await transaction.insert(stockMovements).values({
					productId: orderLine.productId,
					deltaUnits,
					reason: "delivery",
					refTable: "goods_receipts",
					refId: receipt.id,
					actorId,
					note: hasDiscrepancy ? input.discrepancyNote : undefined,
				});
				receivedByLineId.set(
					orderLine.id,
					(receivedByLineId.get(orderLine.id) ?? 0) + inputLine.qtyBulkReceived,
				);
			}

			const fullyReceived = orderLines.every(
				(line) => (receivedByLineId.get(line.id) ?? 0) === line.qtyBulk,
			);
			const partiallyReceived = orderLines.some(
				(line) => (receivedByLineId.get(line.id) ?? 0) > 0,
			);
			const status = fullyReceived
				? "received"
				: partiallyReceived
					? "partially_received"
					: "open";
			await transaction
				.update(purchaseOrders)
				.set({ status })
				.where(eq(purchaseOrders.id, poId));

			const paidNow = centsToMoney(payment.paidNowCents);
			const outstandingAdded = centsToMoney(payment.liabilityCents);
			if (payment.paidNowCents > 0n) {
				await transaction.insert(supplierPayments).values({
					supplierId: purchaseOrder.supplierId,
					poId,
					amount: paidNow,
					paidAt: signedOffAt,
					recordedBy: actorId,
				});
			}
			await transaction
				.update(suppliers)
				.set({
					outstandingBalance: sql`${suppliers.outstandingBalance} + ${outstandingAdded}`,
				})
				.where(eq(suppliers.id, purchaseOrder.supplierId));

			return {
				id: receipt.id,
				poId,
				receivedBy: actorId,
				signedOffAt,
				discrepancyNote: hasDiscrepancy
					? (input.discrepancyNote ?? null)
					: null,
				discrepancyConfirmedBy: hasDiscrepancy ? actorId : null,
				createdAt: receipt.createdAt,
				status,
				receivedValue: centsToMoney(receivedValueCents),
				paidNow,
				outstandingAdded,
				lines: input.lines,
			};
		});
	}
}
