import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { client, createDb } from "db";
import {
	categories,
	goodsReceipts,
	poLines,
	products,
	purchaseOrders,
	receiptLines,
	saleLines,
	sales,
	sessions,
	stockLevels,
	stockMovements,
	supplierPayments,
	suppliers,
	userRoles,
	users,
} from "db/schema";
import { migrateDatabase, truncateDatabase } from "db/testing";
import { count, eq } from "drizzle-orm";
import type { Role } from "shared";
import { createApp } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/middleware/session-cookie";
import { createSessionMaterial } from "../src/services/session";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
	throw new Error(
		"TEST_DATABASE_URL is required for server integration tests. See app/.env.example.",
	);
}

const testClient = client(testDatabaseUrl);
const testDb = createDb(testClient);
const app = createApp(testDb);
let passwordHash = "";
let sequence = 0;

type ErrorBody = { code: string; message: string };
type ProductFixture = {
	id: string;
	name: string;
	sku: string;
	bulkCost: string;
	unitsPerBulk: number;
};
type SaleBody = {
	id: string;
	total: string;
	totalProfit: string;
	lines: Array<{
		id: string;
		productId: string;
		productName: string;
		sku: string;
		qtyUnits: number;
		unitPriceAtSale: string;
		unitCostAtSale: string;
		lineCogs: string;
		lineProfit: string;
	}>;
};

beforeAll(async () => {
	await migrateDatabase(testDb);
	passwordHash = await Bun.password.hash("password123", {
		algorithm: "argon2id",
	});
});

beforeEach(async () => {
	await truncateDatabase(testClient);
	sequence = 0;
});

afterAll(async () => {
	await testClient.end();
});

async function createUser(username: string, roles: Role[]) {
	const [user] = await testDb
		.insert(users)
		.values({ name: `Test ${username}`, username, passwordHash })
		.returning({ id: users.id });
	if (!user) {
		throw new Error("Failed to create test user.");
	}
	await testDb.insert(userRoles).values(
		roles.map((role) => ({
			userId: user.id,
			role,
		})),
	);
	return user;
}

async function createSessionCookie(userId: string) {
	const material = createSessionMaterial();
	await testDb.insert(sessions).values({
		userId,
		tokenHash: material.tokenHash,
		expiresAt: material.expiresAt,
	});
	return `${SESSION_COOKIE_NAME}=${material.token}`;
}

async function request(
	method: string,
	path: string,
	cookie: string,
	body?: unknown,
) {
	const headers = new Headers({ cookie });
	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		headers.set("content-type", "application/json");
		init.body = JSON.stringify(body);
	}
	return app.request(path, init);
}

async function createProduct(options: {
	createdBy: string;
	bulkCost?: string;
	price?: string | null;
	unitsPerBulk?: number;
	qtyUnits?: number;
	published?: boolean;
	archived?: boolean;
}): Promise<ProductFixture> {
	sequence += 1;
	const [category] = await testDb
		.insert(categories)
		.values({ name: `Wave 2 Category ${sequence}` })
		.returning({ id: categories.id });
	if (!category) {
		throw new Error("Failed to create category fixture.");
	}

	const bulkCost = options.bulkCost ?? "12.00";
	const unitsPerBulk = options.unitsPerBulk ?? 12;
	const [product] = await testDb
		.insert(products)
		.values({
			sku: `W2-SKU-${sequence}`,
			name: `Wave 2 Product ${sequence}`,
			categoryId: category.id,
			bulkUnitName: "case",
			unitsPerBulk,
			saleUnitName: "unit",
			bulkCost,
			price: options.price === undefined ? "2.00" : options.price,
			published: options.published ?? true,
			archived: options.archived ?? false,
			createdBy: options.createdBy,
		})
		.returning({
			id: products.id,
			name: products.name,
			sku: products.sku,
		});
	if (!product) {
		throw new Error("Failed to create product fixture.");
	}
	await testDb.insert(stockLevels).values({
		productId: product.id,
		qtyUnits: options.qtyUnits ?? 0,
	});
	return { ...product, bulkCost, unitsPerBulk };
}

async function createPurchaseOrderFixture(options: {
	createdBy: string;
	product: ProductFixture;
	qtyBulk: number;
	supplierId?: string;
}) {
	let supplierId = options.supplierId;
	if (!supplierId) {
		const [supplier] = await testDb
			.insert(suppliers)
			.values({ name: `Wave 2 Supplier ${++sequence}` })
			.returning({ id: suppliers.id });
		if (!supplier) {
			throw new Error("Failed to create supplier fixture.");
		}
		supplierId = supplier.id;
	}

	const [purchaseOrder] = await testDb
		.insert(purchaseOrders)
		.values({ supplierId, createdBy: options.createdBy, status: "open" })
		.returning({ id: purchaseOrders.id });
	if (!purchaseOrder) {
		throw new Error("Failed to create purchase-order fixture.");
	}
	const [line] = await testDb
		.insert(poLines)
		.values({
			poId: purchaseOrder.id,
			productId: options.product.id,
			qtyBulk: options.qtyBulk,
			bulkCostAtOrder: options.product.bulkCost,
		})
		.returning({ id: poLines.id });
	if (!line) {
		throw new Error("Failed to create purchase-order line fixture.");
	}
	return { id: purchaseOrder.id, lineId: line.id, supplierId };
}

async function stockFor(productId: string) {
	const [stock] = await testDb
		.select({ qtyUnits: stockLevels.qtyUnits })
		.from(stockLevels)
		.where(eq(stockLevels.productId, productId));
	return stock?.qtyUnits;
}

describe("SHE-8 cash sales", () => {
	test("records a multi-line sale with exact dozen rounding, stock, movements, and reads", async () => {
		const clerk = await createUser("sale.success", ["sales_clerk"]);
		const dozen = await createProduct({
			createdBy: clerk.id,
			bulkCost: "5000.00",
			price: "500.00",
			unitsPerBulk: 12,
			qtyUnits: 24,
		});
		const second = await createProduct({
			createdBy: clerk.id,
			bulkCost: "12.00",
			price: "2.00",
			unitsPerBulk: 12,
			qtyUnits: 10,
		});
		const cookie = await createSessionCookie(clerk.id);

		const response = await request("POST", "/api/sales", cookie, {
			type: "cash",
			lines: [
				// Client price data is deliberately ignored (BR-PriceControl).
				{ productId: dozen.id, qtyUnits: 12, price: "0.01" },
				{ productId: second.id, qtyUnits: 3 },
			],
		});
		expect(response.status).toBe(200);
		const sale = (await response.json()) as SaleBody;
		expect(sale).toMatchObject({
			total: "6006.00",
			totalProfit: "1003.00",
		});
		expect(sale.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					productId: dozen.id,
					qtyUnits: 12,
					unitPriceAtSale: "500.00",
					unitCostAtSale: "416.6667",
					lineCogs: "5000.00",
					lineProfit: "1000.00",
				}),
				expect.objectContaining({
					productId: second.id,
					qtyUnits: 3,
					unitPriceAtSale: "2.00",
					lineCogs: "3.00",
					lineProfit: "3.00",
				}),
			]),
		);
		expect(await stockFor(dozen.id)).toBe(12);
		expect(await stockFor(second.id)).toBe(7);

		const movements = await testDb
			.select({
				productId: stockMovements.productId,
				deltaUnits: stockMovements.deltaUnits,
				reason: stockMovements.reason,
				refTable: stockMovements.refTable,
				refId: stockMovements.refId,
				actorId: stockMovements.actorId,
			})
			.from(stockMovements);
		expect(movements).toHaveLength(2);
		expect(movements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					productId: dozen.id,
					deltaUnits: -12,
					reason: "sale",
					refTable: "sale_lines",
					actorId: clerk.id,
				}),
				expect.objectContaining({
					productId: second.id,
					deltaUnits: -3,
				}),
			]),
		);
		expect(new Set(movements.map((movement) => movement.refId))).toEqual(
			new Set(sale.lines.map((line) => line.id)),
		);

		const listResponse = await request("GET", "/api/sales", cookie);
		expect(listResponse.status).toBe(200);
		expect(await listResponse.json()).toEqual([
			expect.objectContaining({
				id: sale.id,
				total: "6006.00",
				totalProfit: "1003.00",
				lineCount: 2,
			}),
		]);

		const detailResponse = await request(
			"GET",
			`/api/sales/${sale.id}`,
			cookie,
		);
		expect(detailResponse.status).toBe(200);
		const detail = (await detailResponse.json()) as SaleBody;
		expect(detail.id).toBe(sale.id);
		expect(detail.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					productName: dozen.name,
					sku: dozen.sku,
				}),
			]),
		);
	});

	test("insufficient stock rolls back every sale line, movement, and decrement", async () => {
		const clerk = await createUser("sale.rollback", ["sales_clerk"]);
		const enough = await createProduct({ createdBy: clerk.id, qtyUnits: 5 });
		const short = await createProduct({ createdBy: clerk.id, qtyUnits: 1 });

		const response = await request(
			"POST",
			"/api/sales",
			await createSessionCookie(clerk.id),
			{
				type: "cash",
				lines: [
					{ productId: enough.id, qtyUnits: 2 },
					{ productId: short.id, qtyUnits: 2 },
				],
			},
		);
		expect(response.status).toBe(409);
		expect((await response.json()) as ErrorBody).toMatchObject({
			code: "INSUFFICIENT_STOCK",
		});
		expect(await stockFor(enough.id)).toBe(5);
		expect(await stockFor(short.id)).toBe(1);
		const [saleCount] = await testDb.select({ value: count() }).from(sales);
		const [lineCount] = await testDb.select({ value: count() }).from(saleLines);
		const [movementCount] = await testDb
			.select({ value: count() })
			.from(stockMovements);
		expect(saleCount?.value).toBe(0);
		expect(lineCount?.value).toBe(0);
		expect(movementCount?.value).toBe(0);
	});

	test("unpriced, unpublished, and archived products are not sellable", async () => {
		const clerk = await createUser("sale.state", ["sales_clerk"]);
		const productsUnderTest = [
			await createProduct({
				createdBy: clerk.id,
				price: null,
				qtyUnits: 1,
			}),
			await createProduct({
				createdBy: clerk.id,
				published: false,
				qtyUnits: 1,
			}),
			await createProduct({
				createdBy: clerk.id,
				archived: true,
				qtyUnits: 1,
			}),
		];
		const cookie = await createSessionCookie(clerk.id);

		for (const product of productsUnderTest) {
			const response = await request("POST", "/api/sales", cookie, {
				type: "cash",
				lines: [{ productId: product.id, qtyUnits: 1 }],
			});
			expect(response.status).toBe(409);
			expect((await response.json()) as ErrorBody).toMatchObject({
				code: "PRODUCT_NOT_SELLABLE",
			});
		}
	});

	test("validates lines and enforces sales.record", async () => {
		const salesClerk = await createUser("sale.allowed", ["sales_clerk"]);
		const inventoryClerk = await createUser("sale.denied", ["inventory_clerk"]);
		const product = await createProduct({
			createdBy: salesClerk.id,
			qtyUnits: 3,
		});
		const salesCookie = await createSessionCookie(salesClerk.id);

		const duplicate = await request("POST", "/api/sales", salesCookie, {
			type: "cash",
			lines: [
				{ productId: product.id, qtyUnits: 1 },
				{ productId: product.id, qtyUnits: 1 },
			],
		});
		expect(duplicate.status).toBe(400);
		expect((await duplicate.json()) as ErrorBody).toMatchObject({
			code: "DUPLICATE_LINE",
		});
		expect(
			(
				await request("POST", "/api/sales", salesCookie, {
					type: "cash",
					lines: [],
				})
			).status,
		).toBe(400);
		expect(
			(
				await request("POST", "/api/sales", salesCookie, {
					type: "cash",
					lines: [{ productId: product.id, qtyUnits: 0 }],
				})
			).status,
		).toBe(400);

		const forbidden = await request(
			"POST",
			"/api/sales",
			await createSessionCookie(inventoryClerk.id),
			{
				type: "cash",
				lines: [{ productId: product.id, qtyUnits: 1 }],
			},
		);
		expect(forbidden.status).toBe(403);
	});

	test("two concurrent sales of the last unit produce one success and one conflict", async () => {
		const clerk = await createUser("sale.concurrent", ["sales_clerk"]);
		const product = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 1,
		});
		const cookie = await createSessionCookie(clerk.id);
		const body = {
			type: "cash",
			lines: [{ productId: product.id, qtyUnits: 1 }],
		};

		const responses = await Promise.all([
			request("POST", "/api/sales", cookie, body),
			request("POST", "/api/sales", cookie, body),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		const rejected = responses.find((response) => response.status === 409);
		expect(rejected).toBeDefined();
		expect((await rejected?.json()) as ErrorBody).toMatchObject({
			code: "INSUFFICIENT_STOCK",
		});
		expect(await stockFor(product.id)).toBe(0);
		const [saleCount] = await testDb.select({ value: count() }).from(sales);
		const [movementCount] = await testDb
			.select({ value: count() })
			.from(stockMovements);
		expect(saleCount?.value).toBe(1);
		expect(movementCount?.value).toBe(1);
	});
});

describe("SHE-11 delivery sign-off", () => {
	test("a full immediate receipt increases stock, closes the PO, pays it, and cannot be re-signed", async () => {
		const manager = await createUser("delivery.creator", ["manager"]);
		const clerk = await createUser("delivery.full", ["inventory_clerk"]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "25.00",
			unitsPerBulk: 12,
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 4,
		});
		const cookie = await createSessionCookie(clerk.id);
		const body = {
			lines: [{ poLineId: order.lineId, qtyBulkReceived: 4 }],
			payment: { kind: "immediate" },
		};

		const response = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			body,
		);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			poId: order.id,
			status: "received",
			receivedValue: "100.00",
			paidNow: "100.00",
			outstandingAdded: "0.00",
		});
		expect(await stockFor(product.id)).toBe(48);
		const [storedOrder] = await testDb
			.select({ status: purchaseOrders.status })
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, order.id));
		const [supplier] = await testDb
			.select({ balance: suppliers.outstandingBalance })
			.from(suppliers)
			.where(eq(suppliers.id, order.supplierId));
		const [payment] = await testDb
			.select({ amount: supplierPayments.amount })
			.from(supplierPayments)
			.where(eq(supplierPayments.poId, order.id));
		expect(storedOrder?.status).toBe("received");
		expect(supplier?.balance).toBe("0.00");
		expect(payment?.amount).toBe("100.00");

		const [movement] = await testDb
			.select({
				deltaUnits: stockMovements.deltaUnits,
				reason: stockMovements.reason,
				refTable: stockMovements.refTable,
				actorId: stockMovements.actorId,
			})
			.from(stockMovements)
			.where(eq(stockMovements.productId, product.id));
		expect(movement).toEqual({
			deltaUnits: 48,
			reason: "delivery",
			refTable: "goods_receipts",
			actorId: clerk.id,
		});

		const second = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			body,
		);
		expect(second.status).toBe(409);
		expect((await second.json()) as ErrorBody).toMatchObject({
			code: "PO_ALREADY_RECEIVED",
		});
	});

	test("a confirmed partial receipt records only this receipt's value and remaining quantities", async () => {
		const manager = await createUser("delivery.partial", ["manager"]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "25.00",
			unitsPerBulk: 12,
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 10,
		});
		const cookie = await createSessionCookie(manager.id);

		const response = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 4 }],
				payment: { kind: "partial", amount: "30.00" },
				discrepancyNote: "Six cases were not on the truck.",
				discrepancyConfirmed: true,
			},
		);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			status: "partially_received",
			receivedValue: "100.00",
			paidNow: "30.00",
			outstandingAdded: "70.00",
		});
		expect(await stockFor(product.id)).toBe(48);
		const [supplier] = await testDb
			.select({ balance: suppliers.outstandingBalance })
			.from(suppliers)
			.where(eq(suppliers.id, order.supplierId));
		expect(supplier?.balance).toBe("70.00");

		const detail = await request(
			"GET",
			`/api/purchase-orders/${order.id}`,
			cookie,
		);
		expect(detail.status).toBe(200);
		expect(await detail.json()).toMatchObject({
			status: "partially_received",
			lines: [
				expect.objectContaining({
					id: order.lineId,
					receivedSoFar: 4,
					remaining: 6,
				}),
			],
		});
		const [receipt] = await testDb
			.select({
				note: goodsReceipts.discrepancyNote,
				confirmedBy: goodsReceipts.discrepancyConfirmedBy,
			})
			.from(goodsReceipts)
			.where(eq(goodsReceipts.poId, order.id));
		expect(receipt).toEqual({
			note: "Six cases were not on the truck.",
			confirmedBy: manager.id,
		});
	});

	test("deferred payment adds the full received value to supplier balance", async () => {
		const manager = await createUser("delivery.deferred", ["manager"]);
		const clerk = await createUser("delivery.deferred.clerk", [
			"inventory_clerk",
		]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "12.50",
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 3,
		});

		const response = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			await createSessionCookie(clerk.id),
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 3 }],
				payment: { kind: "deferred" },
			},
		);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			receivedValue: "37.50",
			paidNow: "0.00",
			outstandingAdded: "37.50",
		});
		const [supplier] = await testDb
			.select({ balance: suppliers.outstandingBalance })
			.from(suppliers)
			.where(eq(suppliers.id, order.supplierId));
		const [paymentCount] = await testDb
			.select({ value: count() })
			.from(supplierPayments);
		expect(supplier?.balance).toBe("37.50");
		expect(paymentCount?.value).toBe(0);
	});

	test("partial delivery plus deferred payment uses receipt value, never full PO value", async () => {
		const manager = await createUser("delivery.receipt-base", ["manager"]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "20.00",
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 10,
		});

		const response = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			await createSessionCookie(manager.id),
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 2 }],
				payment: { kind: "deferred" },
				discrepancyConfirmed: true,
				discrepancyNote: "Eight cases remain outstanding.",
			},
		);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			status: "partially_received",
			receivedValue: "40.00",
			outstandingAdded: "40.00",
		});
		const [supplier] = await testDb
			.select({ balance: suppliers.outstandingBalance })
			.from(suppliers)
			.where(eq(suppliers.id, order.supplierId));
		expect(supplier?.balance).toBe("40.00");
		expect(supplier?.balance).not.toBe("200.00");
	});

	test("an inventory clerk can sign off a plain partial delivery without a manager", async () => {
		const manager = await createUser("delivery.partial.creator", ["manager"]);
		const clerk = await createUser("delivery.partial.clerk", [
			"inventory_clerk",
		]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "10.00",
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 5,
		});
		const cookie = await createSessionCookie(clerk.id);

		// 3 of 5, no discrepancy note — a normal partial, no manager needed.
		const partial = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 3 }],
				payment: { kind: "deferred" },
			},
		);
		expect(partial.status).toBe(201);
		expect(await stockFor(product.id)).toBe(3 * product.unitsPerBulk);

		const [order2] = await testDb
			.select({ status: purchaseOrders.status })
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, order.id));
		expect(order2?.status).toBe("partially_received");
	});

	test("a flagged discrepancy needs a manager's confirmation", async () => {
		const manager = await createUser("delivery.confirm.creator", ["manager"]);
		const clerk = await createUser("delivery.confirm.clerk", [
			"inventory_clerk",
		]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "10.00",
		});
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 5,
		});
		const cookie = await createSessionCookie(clerk.id);

		// A clerk flags a discrepancy but cannot confirm it.
		const unconfirmed = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 3 }],
				payment: { kind: "deferred" },
				discrepancyNote: "Two cases arrived crushed.",
			},
		);
		expect(unconfirmed.status).toBe(409);
		expect((await unconfirmed.json()) as ErrorBody).toMatchObject({
			code: "DISCREPANCY_NEEDS_CONFIRMATION",
		});

		const unauthorized = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			cookie,
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 3 }],
				payment: { kind: "deferred" },
				discrepancyNote: "Two cases arrived crushed.",
				discrepancyConfirmed: true,
			},
		);
		expect(unauthorized.status).toBe(403);
		expect((await unauthorized.json()) as ErrorBody).toMatchObject({
			code: "FORBIDDEN",
		});
		expect(await stockFor(product.id)).toBe(0);
		const [receiptCount] = await testDb
			.select({ value: count() })
			.from(receiptLines);
		expect(receiptCount?.value).toBe(0);
	});

	test("over-receipt is rejected without stock or receipt mutations", async () => {
		const manager = await createUser("delivery.over.creator", ["manager"]);
		const clerk = await createUser("delivery.over.clerk", ["inventory_clerk"]);
		const product = await createProduct({ createdBy: manager.id });
		const order = await createPurchaseOrderFixture({
			createdBy: manager.id,
			product,
			qtyBulk: 2,
		});

		const response = await request(
			"POST",
			`/api/purchase-orders/${order.id}/receipts`,
			await createSessionCookie(clerk.id),
			{
				lines: [{ poLineId: order.lineId, qtyBulkReceived: 3 }],
				payment: { kind: "deferred" },
			},
		);
		expect(response.status).toBe(409);
		expect((await response.json()) as ErrorBody).toMatchObject({
			code: "OVER_RECEIPT",
		});
		expect(await stockFor(product.id)).toBe(0);
		const [receiptCount] = await testDb
			.select({ value: count() })
			.from(goodsReceipts);
		expect(receiptCount?.value).toBe(0);
	});
});
