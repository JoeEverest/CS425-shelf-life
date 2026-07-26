import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { client, createDb } from "db";
import {
	categories,
	customerPayments,
	customers,
	expenses,
	invoices,
	products,
	saleLines,
	sales,
	sessions,
	stockLevels,
	stockMovements,
	stores,
	suppliers,
	userRoles,
	users,
} from "db/schema";
import { migrateDatabase, truncateDatabase } from "db/testing";
import { count, eq } from "drizzle-orm";
import type { Role } from "shared";
import { createApp } from "../src/app";
import { SESSION_COOKIE_NAME } from "../src/middleware/session-cookie";
import { calculateStockVelocity } from "../src/rules/stock-velocity";
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

type ProductFixture = {
	id: string;
	name: string;
	sku: string;
};

type InvoiceBody = {
	id: string;
	customerId: string;
	total: string;
	balance: string;
	saleId: string;
	payments: Array<{ id: string; amount: string }>;
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

async function createStore(options?: {
	velocityWindowDays?: number;
	lowStockCoverDays?: number;
}) {
	await testDb.insert(stores).values({
		name: "Wave 3 Store",
		currency: "USD",
		address: "Test address",
		velocityWindowDays: options?.velocityWindowDays ?? 30,
		lowStockCoverDays: options?.lowStockCoverDays ?? 7,
	});
}

async function createProduct(options: {
	createdBy: string;
	qtyUnits: number;
	price?: string;
	bulkCost?: string;
}): Promise<ProductFixture> {
	sequence += 1;
	const [category] = await testDb
		.insert(categories)
		.values({ name: `Wave 3 Category ${sequence}` })
		.returning({ id: categories.id });
	if (!category) {
		throw new Error("Failed to create category fixture.");
	}
	const [product] = await testDb
		.insert(products)
		.values({
			sku: `W3-SKU-${sequence}`,
			name: `Wave 3 Product ${sequence}`,
			categoryId: category.id,
			bulkUnitName: "case",
			unitsPerBulk: 12,
			saleUnitName: "unit",
			bulkCost: options.bulkCost ?? "12.00",
			price: options.price ?? "2.00",
			published: true,
			createdBy: options.createdBy,
		})
		.returning({ id: products.id, name: products.name, sku: products.sku });
	if (!product) {
		throw new Error("Failed to create product fixture.");
	}
	await testDb.insert(stockLevels).values({
		productId: product.id,
		qtyUnits: options.qtyUnits,
	});
	return product;
}

async function createCustomer(name = "Wave 3 Customer") {
	const [customer] = await testDb
		.insert(customers)
		.values({ name })
		.returning({ id: customers.id });
	if (!customer) {
		throw new Error("Failed to create customer fixture.");
	}
	return customer;
}

async function createCreditSale(options: {
	cookie: string;
	productId: string;
	customerId: string;
	qtyUnits: number;
}) {
	const response = await request("POST", "/api/sales", options.cookie, {
		type: "credit",
		customerId: options.customerId,
		lines: [{ productId: options.productId, qtyUnits: options.qtyUnits }],
	});
	expect(response.status).toBe(200);
	return (await response.json()) as { id: string; total: string };
}

describe("SHE-9 stock velocity", () => {
	test("pure rule handles daily, infrequent, and zero-history sellers", () => {
		expect(
			calculateStockVelocity({
				qtyUnits: 14,
				unitsSoldInWindow: 30,
				windowDays: 30,
				coverDays: 14,
			}),
		).toEqual({ velocityPerDay: 1, daysToStockout: 14, low: true });
		expect(
			calculateStockVelocity({
				qtyUnits: 50,
				unitsSoldInWindow: 1,
				windowDays: 30,
				coverDays: 7,
			}).low,
		).toBe(false);
		expect(
			calculateStockVelocity({
				qtyUnits: 0,
				unitsSoldInWindow: 0,
				windowDays: 30,
				coverDays: 7,
			}),
		).toEqual({ velocityPerDay: 0, daysToStockout: null, low: false });
	});

	test("uses only in-window sales, falls back for no history, and sorts low first", async () => {
		const clerk = await createUser("velocity.clerk", ["inventory_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		await createStore({ velocityWindowDays: 10, lowStockCoverDays: 3 });
		const normal = await createProduct({ createdBy: clerk.id, qtyUnits: 20 });
		const noHistory = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 50,
		});
		const fast = await createProduct({ createdBy: clerk.id, qtyUnits: 4 });

		await testDb.insert(stockMovements).values([
			{
				productId: normal.id,
				deltaUnits: -20,
				reason: "sale",
				refTable: "test_sales",
				refId: randomUUID(),
				actorId: clerk.id,
				occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000),
			},
			{
				productId: normal.id,
				deltaUnits: -100,
				reason: "sale",
				refTable: "test_sales",
				refId: randomUUID(),
				actorId: clerk.id,
				occurredAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1_000),
			},
			{
				productId: fast.id,
				deltaUnits: -20,
				reason: "credit_sale",
				refTable: "test_sales",
				refId: randomUUID(),
				actorId: clerk.id,
			},
		]);

		const response = await request("GET", "/api/stock/alerts", cookie);
		expect(response.status).toBe(200);
		const alerts = (await response.json()) as Array<{
			productId: string;
			velocityPerDay: string;
			daysToStockout: string | null;
			low: boolean;
			hasHistory: boolean;
		}>;
		expect(alerts[0]).toMatchObject({
			productId: fast.id,
			velocityPerDay: "2.0000",
			daysToStockout: "2.0",
			low: true,
			hasHistory: true,
		});
		expect(alerts.find((alert) => alert.productId === normal.id)).toMatchObject(
			{
				velocityPerDay: "2.0000",
				daysToStockout: "10.0",
				low: false,
				hasHistory: true,
			},
		);
		expect(
			alerts.find((alert) => alert.productId === noHistory.id),
		).toMatchObject({
			velocityPerDay: "0.0000",
			daysToStockout: null,
			low: false,
			hasHistory: false,
		});
	});
});

describe("SHE-12 credit invoices", () => {
	test("creates and reads customers with their outstanding balance", async () => {
		const clerk = await createUser("customer.manage", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		const createResponse = await request("POST", "/api/customers", cookie, {
			name: "  Test Customer  ",
			phone: "555-0100",
		});
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as {
			id: string;
			name: string;
			outstandingBalance: string;
		};
		expect(created).toMatchObject({
			name: "Test Customer",
			outstandingBalance: "0.00",
		});

		const listResponse = await request("GET", "/api/customers", cookie);
		expect(listResponse.status).toBe(200);
		expect(await listResponse.json()).toEqual([
			expect.objectContaining({ id: created.id, outstandingBalance: "0.00" }),
		]);
		const detailResponse = await request(
			"GET",
			`/api/customers/${created.id}`,
			cookie,
		);
		expect(detailResponse.status).toBe(200);
		expect(await detailResponse.json()).toMatchObject({
			id: created.id,
			outstandingBalance: "0.00",
		});
	});

	test("credit sale atomically decrements stock, creates an invoice, and raises customer balance", async () => {
		const clerk = await createUser("credit.success", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		const product = await createProduct({ createdBy: clerk.id, qtyUnits: 10 });
		const customer = await createCustomer();

		const sale = await createCreditSale({
			cookie,
			productId: product.id,
			customerId: customer.id,
			qtyUnits: 3,
		});
		expect(sale.total).toBe("6.00");

		const [stock] = await testDb
			.select({ qtyUnits: stockLevels.qtyUnits })
			.from(stockLevels)
			.where(eq(stockLevels.productId, product.id));
		const [invoice] = await testDb
			.select({
				id: invoices.id,
				saleId: invoices.saleId,
				total: invoices.total,
				balance: invoices.balance,
			})
			.from(invoices);
		const [customerRow] = await testDb
			.select({ balance: customers.outstandingBalance })
			.from(customers)
			.where(eq(customers.id, customer.id));
		expect(stock?.qtyUnits).toBe(7);
		expect(invoice).toEqual({
			id: expect.any(String),
			saleId: sale.id,
			total: "6.00",
			balance: "6.00",
		});
		expect(customerRow?.balance).toBe("6.00");
		if (!invoice) {
			throw new Error("Expected invoice fixture.");
		}
		const invoiceListResponse = await request(
			"GET",
			`/api/invoices?customerId=${customer.id}`,
			cookie,
		);
		expect(invoiceListResponse.status).toBe(200);
		expect(await invoiceListResponse.json()).toEqual([
			expect.objectContaining({
				id: invoice.id,
				customerId: customer.id,
				balance: "6.00",
				saleId: sale.id,
			}),
		]);
		const detailResponse = await request(
			"GET",
			`/api/invoices/${invoice.id}`,
			cookie,
		);
		expect(detailResponse.status).toBe(200);
		expect(await detailResponse.json()).toMatchObject({
			id: invoice.id,
			payments: [],
		});
	});

	test("insufficient stock rolls back the credit sale, invoice, movement, and balance", async () => {
		const clerk = await createUser("credit.rollback", ["sales_clerk"]);
		const product = await createProduct({ createdBy: clerk.id, qtyUnits: 1 });
		const customer = await createCustomer();
		const response = await request(
			"POST",
			"/api/sales",
			await createSessionCookie(clerk.id),
			{
				type: "credit",
				customerId: customer.id,
				lines: [{ productId: product.id, qtyUnits: 2 }],
			},
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "INSUFFICIENT_STOCK",
		});

		const [saleCounts, lineCounts, invoiceCounts, movementCounts] =
			await Promise.all([
				testDb.select({ value: count(sales.id) }).from(sales),
				testDb.select({ value: count(saleLines.id) }).from(saleLines),
				testDb.select({ value: count(invoices.id) }).from(invoices),
				testDb.select({ value: count(stockMovements.id) }).from(stockMovements),
			]);
		const [customerRow] = await testDb
			.select({ balance: customers.outstandingBalance })
			.from(customers)
			.where(eq(customers.id, customer.id));
		const [stock] = await testDb
			.select({ qtyUnits: stockLevels.qtyUnits })
			.from(stockLevels)
			.where(eq(stockLevels.productId, product.id));
		expect({
			sales: saleCounts[0]?.value,
			lines: lineCounts[0]?.value,
			invoices: invoiceCounts[0]?.value,
			movements: movementCounts[0]?.value,
		}).toEqual({
			sales: 0,
			lines: 0,
			invoices: 0,
			movements: 0,
		});
		expect(customerRow?.balance).toBe("0.00");
		expect(stock?.qtyUnits).toBe(1);
	});

	test("cash sales create no invoice and a missing credit customer returns 404", async () => {
		const clerk = await createUser("credit.edges", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		const cashProduct = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 5,
		});
		const cashResponse = await request("POST", "/api/sales", cookie, {
			type: "cash",
			lines: [{ productId: cashProduct.id, qtyUnits: 1 }],
		});
		expect(cashResponse.status).toBe(200);
		const [invoiceCount] = await testDb
			.select({ value: count(invoices.id) })
			.from(invoices);
		expect(invoiceCount?.value).toBe(0);

		const creditProduct = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 5,
		});
		const missingResponse = await request("POST", "/api/sales", cookie, {
			type: "credit",
			customerId: randomUUID(),
			lines: [{ productId: creditProduct.id, qtyUnits: 1 }],
		});
		expect(missingResponse.status).toBe(404);
		expect(await missingResponse.json()).toMatchObject({
			code: "CUSTOMER_NOT_FOUND",
		});
	});
});

describe("SHE-12 customer payments", () => {
	test("partial and full payments reduce invoice and customer balances", async () => {
		const clerk = await createUser("payment.success", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		const product = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 5,
			price: "10.00",
		});
		const customer = await createCustomer();
		await createCreditSale({
			cookie,
			productId: product.id,
			customerId: customer.id,
			qtyUnits: 2,
		});
		const [invoice] = await testDb.select({ id: invoices.id }).from(invoices);
		if (!invoice) {
			throw new Error("Expected invoice fixture.");
		}

		const partialResponse = await request(
			"POST",
			`/api/invoices/${invoice.id}/payments`,
			cookie,
			{ amount: "5.00" },
		);
		expect(partialResponse.status).toBe(201);
		expect((await partialResponse.json()) as InvoiceBody).toMatchObject({
			balance: "15.00",
			payments: [expect.objectContaining({ amount: "5.00" })],
		});

		const fullResponse = await request(
			"POST",
			`/api/invoices/${invoice.id}/payments`,
			cookie,
			{ amount: "15.00" },
		);
		expect(fullResponse.status).toBe(201);
		expect((await fullResponse.json()) as InvoiceBody).toMatchObject({
			balance: "0.00",
		});
		const [customerRow] = await testDb
			.select({ balance: customers.outstandingBalance })
			.from(customers)
			.where(eq(customers.id, customer.id));
		expect(customerRow?.balance).toBe("0.00");
	});

	test("overpayment is rejected without writing a payment or changing balances", async () => {
		const clerk = await createUser("payment.over", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);
		const product = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 5,
			price: "10.00",
		});
		const customer = await createCustomer();
		await createCreditSale({
			cookie,
			productId: product.id,
			customerId: customer.id,
			qtyUnits: 2,
		});
		const [invoice] = await testDb
			.select({ id: invoices.id, balance: invoices.balance })
			.from(invoices);
		if (!invoice) {
			throw new Error("Expected invoice fixture.");
		}

		const response = await request(
			"POST",
			`/api/invoices/${invoice.id}/payments`,
			cookie,
			{ amount: "20.01" },
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: "OVERPAYMENT" });
		const [paymentCount] = await testDb
			.select({ value: count(customerPayments.id) })
			.from(customerPayments);
		const [balances] = await testDb
			.select({
				invoice: invoices.balance,
				customer: customers.outstandingBalance,
			})
			.from(invoices)
			.innerJoin(customers, eq(customers.id, invoices.customerId));
		expect(paymentCount?.value).toBe(0);
		expect(balances).toEqual({ invoice: "20.00", customer: "20.00" });
	});

	test("a role without invoices.record_payment receives 403", async () => {
		const clerk = await createUser("payment.owner", ["sales_clerk"]);
		const inventoryClerk = await createUser("payment.denied", [
			"inventory_clerk",
		]);
		const product = await createProduct({
			createdBy: clerk.id,
			qtyUnits: 5,
		});
		const customer = await createCustomer();
		await createCreditSale({
			cookie: await createSessionCookie(clerk.id),
			productId: product.id,
			customerId: customer.id,
			qtyUnits: 1,
		});
		const [invoice] = await testDb.select({ id: invoices.id }).from(invoices);
		if (!invoice) {
			throw new Error("Expected invoice fixture.");
		}

		const response = await request(
			"POST",
			`/api/invoices/${invoice.id}/payments`,
			await createSessionCookie(inventoryClerk.id),
			{ amount: "1.00" },
		);
		expect(response.status).toBe(403);
	});
});

describe("SHE-14 analytics dashboard", () => {
	test("reconciles sales, profit, products, expenses, and balances in SQL", async () => {
		const manager = await createUser("dashboard.manager", ["manager"]);
		const clerk = await createUser("dashboard.clerk", ["sales_clerk"]);
		await createStore();
		const first = await createProduct({
			createdBy: manager.id,
			qtyUnits: 3,
			price: "10.00",
		});
		const second = await createProduct({
			createdBy: manager.id,
			qtyUnits: 20,
			price: "5.00",
		});
		const customer = await createCustomer();
		const clerkCookie = await createSessionCookie(clerk.id);
		await createCreditSale({
			cookie: clerkCookie,
			productId: first.id,
			customerId: customer.id,
			qtyUnits: 3,
		});
		const cashResponse = await request("POST", "/api/sales", clerkCookie, {
			type: "cash",
			lines: [{ productId: second.id, qtyUnits: 4 }],
		});
		expect(cashResponse.status).toBe(200);

		const today = new Date().toISOString().slice(0, 10);
		await testDb.insert(expenses).values({
			category: "rent",
			amount: "10.00",
			incurredOn: today,
			recordedBy: manager.id,
		});
		await testDb.insert(suppliers).values({
			name: "Dashboard Supplier",
			outstandingBalance: "12.50",
		});

		const from = new Date(Date.now() - 24 * 60 * 60 * 1_000)
			.toISOString()
			.slice(0, 10);
		const to = new Date(Date.now() + 24 * 60 * 60 * 1_000)
			.toISOString()
			.slice(0, 10);
		const managerResponse = await request(
			"GET",
			`/api/analytics/dashboard?from=${from}&to=${to}`,
			await createSessionCookie(manager.id),
		);
		expect(managerResponse.status).toBe(200);
		const dashboard = (await managerResponse.json()) as {
			salesTotal: string;
			salesProfit: string;
			salesCount: number;
			topProducts: Array<{
				productId: string;
				unitsSold: number;
				revenue: string;
				profit: string;
			}>;
			lowStockCount: number;
			supplierPayable: string;
			customerReceivable: string;
			expensesTotal: string;
			netProfit: string;
		};
		expect(dashboard).toMatchObject({
			salesTotal: "50.00",
			salesProfit: "43.00",
			salesCount: 2,
			lowStockCount: 1,
			supplierPayable: "12.50",
			customerReceivable: "30.00",
			expensesTotal: "10.00",
			netProfit: "33.00",
		});
		expect(dashboard.topProducts).toEqual([
			expect.objectContaining({
				productId: first.id,
				unitsSold: 3,
				revenue: "30.00",
				profit: "27.00",
			}),
			expect.objectContaining({
				productId: second.id,
				unitsSold: 4,
				revenue: "20.00",
				profit: "16.00",
			}),
		]);

		const deniedResponse = await request(
			"GET",
			`/api/analytics/dashboard?from=${from}&to=${to}`,
			await createSessionCookie(clerk.id),
		);
		expect(deniedResponse.status).toBe(403);
	});

	test("the default dashboard (no params) includes sales recorded today", async () => {
		const manager = await createUser("dash.today.mgr", ["manager"]);
		const clerk = await createUser("dash.today.clerk", ["sales_clerk"]);
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "6.00",
			price: "10.00",
			qtyUnits: 20,
		});
		const clerkCookie = await createSessionCookie(clerk.id);

		const sale = await request("POST", "/api/sales", clerkCookie, {
			type: "cash",
			lines: [{ productId: product.id, qtyUnits: 2 }],
		});
		expect(sale.status).toBe(200);

		// No from/to — the path the SPA actually uses. Today must be counted.
		const response = await request(
			"GET",
			"/api/analytics/dashboard",
			await createSessionCookie(manager.id),
		);
		expect(response.status).toBe(200);
		const dashboard = (await response.json()) as {
			salesTotal: string;
			salesCount: number;
		};
		expect(dashboard.salesCount).toBe(1);
		expect(dashboard.salesTotal).toBe("20.00");
	});
});
