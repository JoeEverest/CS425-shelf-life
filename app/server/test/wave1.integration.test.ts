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
	expenses,
	poLines,
	priceChanges,
	products,
	saleLines,
	sales,
	sessions,
	stockLevels,
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
import { PricingRepo } from "../src/repos/pricing-repo";
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
type UserBody = {
	id: string;
	name: string;
	username: string;
	roles: Role[];
	active: boolean;
};
type SupplierBody = {
	id: string;
	name: string;
	phone: string | null;
	note: string | null;
	outstandingBalance: string;
	archived: boolean;
};
type PurchaseOrderBody = {
	id: string;
	supplierId: string;
	supplierName: string;
	status: string;
	lines: Array<{
		productId: string;
		productName: string;
		qtyBulk: number;
		bulkCostAtOrder: string;
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
		.values({
			name: `Test ${username}`,
			username,
			passwordHash,
		})
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

async function createStore() {
	const [store] = await testDb
		.insert(stores)
		.values({
			name: "ShelfLife Test",
			currency: "USD",
			address: "1 Test Avenue",
		})
		.returning({ id: stores.id });
	if (!store) {
		throw new Error("Failed to create test store.");
	}
	return store;
}

async function createProduct(options: {
	createdBy: string;
	bulkCost?: string;
	price?: string | null;
	archived?: boolean;
	published?: boolean;
}) {
	sequence += 1;
	const [category] = await testDb
		.insert(categories)
		.values({ name: `Category ${sequence}` })
		.returning({ id: categories.id });
	if (!category) {
		throw new Error("Failed to create test category.");
	}

	const [product] = await testDb
		.insert(products)
		.values({
			sku: `SKU-${sequence}`,
			name: `Product ${sequence}`,
			categoryId: category.id,
			bulkUnitName: "case",
			unitsPerBulk: 12,
			saleUnitName: "unit",
			bulkCost: options.bulkCost ?? "12.50",
			price: options.price,
			archived: options.archived ?? false,
			published: options.published ?? false,
			createdBy: options.createdBy,
		})
		.returning({ id: products.id, name: products.name });
	if (!product) {
		throw new Error("Failed to create test product.");
	}
	await testDb.insert(stockLevels).values({
		productId: product.id,
		qtyUnits: 0,
	});
	return product;
}

describe("employees and store settings", () => {
	test("employee CRUD hashes passwords and transactionally replaces roles", async () => {
		const admin = await createUser("employees.admin", ["admin"]);
		const cookie = await createSessionCookie(admin.id);

		const createdResponse = await request("POST", "/api/users", cookie, {
			name: "Morgan Employee",
			username: "morgan.employee",
			password: "strong-password",
			roles: ["sales_clerk", "inventory_clerk"],
		});
		expect(createdResponse.status).toBe(201);
		const created = (await createdResponse.json()) as UserBody;
		expect(created).toMatchObject({
			name: "Morgan Employee",
			username: "morgan.employee",
			active: true,
		});
		expect(created.roles).toEqual(
			expect.arrayContaining(["sales_clerk", "inventory_clerk"]),
		);

		const [stored] = await testDb
			.select({ passwordHash: users.passwordHash })
			.from(users)
			.where(eq(users.id, created.id));
		expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
		expect(
			stored
				? await Bun.password.verify("strong-password", stored.passwordHash)
				: false,
		).toBe(true);

		const updatedResponse = await request(
			"PATCH",
			`/api/users/${created.id}`,
			cookie,
			{ name: "Morgan Updated", roles: ["accountant"] },
		);
		expect(updatedResponse.status).toBe(200);
		expect((await updatedResponse.json()) as UserBody).toMatchObject({
			name: "Morgan Updated",
			roles: ["accountant"],
		});

		const storedRoles = await testDb
			.select({ role: userRoles.role })
			.from(userRoles)
			.where(eq(userRoles.userId, created.id));
		expect(storedRoles).toEqual([{ role: "accountant" }]);

		const deactivate = await request(
			"POST",
			`/api/users/${created.id}/deactivate`,
			cookie,
		);
		expect(deactivate.status).toBe(200);
		expect((await deactivate.json()) as UserBody).toMatchObject({
			active: false,
		});

		const reactivate = await request(
			"POST",
			`/api/users/${created.id}/reactivate`,
			cookie,
		);
		expect(reactivate.status).toBe(200);
		expect((await reactivate.json()) as UserBody).toMatchObject({
			active: true,
		});

		const list = await request("GET", "/api/users", cookie);
		expect(list.status).toBe(200);
		expect((await list.json()) as UserBody[]).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: created.id, roles: ["accountant"] }),
			]),
		);
	});

	test("duplicate usernames return the stable conflict code", async () => {
		const admin = await createUser("duplicate.admin", ["admin"]);
		await createUser("duplicate.employee", ["sales_clerk"]);
		const response = await request(
			"POST",
			"/api/users",
			await createSessionCookie(admin.id),
			{
				name: "Duplicate",
				username: "duplicate.employee",
				password: "password123",
				roles: ["sales_clerk"],
			},
		);
		expect(response.status).toBe(409);
		expect((await response.json()) as ErrorBody).toMatchObject({
			code: "DUPLICATE_USERNAME",
		});
	});

	test("an admin cannot deactivate themselves", async () => {
		const admin = await createUser("lockout.admin", ["admin", "manager"]);
		const cookie = await createSessionCookie(admin.id);

		const deactivate = await request(
			"POST",
			`/api/users/${admin.id}/deactivate`,
			cookie,
		);
		expect(deactivate.status).toBe(409);
		expect((await deactivate.json()) as ErrorBody).toMatchObject({
			code: "CANNOT_DEACTIVATE_SELF",
		});
	});

	test("a manager cannot grant themselves the admin role", async () => {
		const manager = await createUser("escalate.manager", ["manager"]);
		const cookie = await createSessionCookie(manager.id);

		const escalate = await request(
			"PATCH",
			`/api/users/${manager.id}`,
			cookie,
			{ roles: ["manager", "admin"] },
		);
		expect(escalate.status).toBe(403);
		expect((await escalate.json()) as ErrorBody).toMatchObject({
			code: "FORBIDDEN",
		});

		const roles = await testDb
			.select({ role: userRoles.role })
			.from(userRoles)
			.where(eq(userRoles.userId, manager.id));
		expect(roles).toEqual([{ role: "manager" }]);
	});

	test("a manager cannot strip another user's admin role", async () => {
		const admin = await createUser("target.admin", ["admin"]);
		const manager = await createUser("attacker.manager", ["manager"]);
		const cookie = await createSessionCookie(manager.id);

		const strip = await request("PATCH", `/api/users/${admin.id}`, cookie, {
			roles: ["manager"],
		});
		expect(strip.status).toBe(403);

		const roles = await testDb
			.select({ role: userRoles.role })
			.from(userRoles)
			.where(eq(userRoles.userId, admin.id));
		expect(roles).toEqual([{ role: "admin" }]);
	});

	test("the last active admin cannot be demoted or deactivated", async () => {
		const admin = await createUser("solo.admin", ["admin"]);
		const otherAdmin = await createUser("second.admin", ["admin"]);
		const cookie = await createSessionCookie(admin.id);

		// Two admins: demoting one is allowed.
		const demoteOther = await request(
			"PATCH",
			`/api/users/${otherAdmin.id}`,
			cookie,
			{ roles: ["manager"] },
		);
		expect(demoteOther.status).toBe(200);

		// Now admin is the only one — demoting or deactivating must fail.
		const demoteLast = await request(
			"PATCH",
			`/api/users/${admin.id}`,
			cookie,
			{ roles: ["manager"] },
		);
		expect(demoteLast.status).toBe(409);
		expect((await demoteLast.json()) as ErrorBody).toMatchObject({
			code: "LAST_ADMIN",
		});

		const otherCookie = await createSessionCookie(otherAdmin.id);
		const deactivateLast = await request(
			"POST",
			`/api/users/${admin.id}/deactivate`,
			otherCookie,
		);
		expect(deactivateLast.status).toBe(409);
		expect((await deactivateLast.json()) as ErrorBody).toMatchObject({
			code: "LAST_ADMIN",
		});
	});

	test("a user without employees.manage cannot mutate accounts", async () => {
		const clerk = await createUser("nope.clerk", ["sales_clerk"]);
		const target = await createUser("nope.target", ["sales_clerk"]);
		const cookie = await createSessionCookie(clerk.id);

		const patch = await request("PATCH", `/api/users/${target.id}`, cookie, {
			name: "Renamed",
		});
		expect(patch.status).toBe(403);

		const deactivate = await request(
			"POST",
			`/api/users/${target.id}/deactivate`,
			cookie,
		);
		expect(deactivate.status).toBe(403);
	});

	test("store settings allow authenticated reads, enforce RBAC, and reject currency", async () => {
		await createStore();
		const admin = await createUser("store.admin", ["admin"]);
		const clerk = await createUser("store.clerk", ["sales_clerk"]);
		const adminCookie = await createSessionCookie(admin.id);
		const clerkCookie = await createSessionCookie(clerk.id);

		const read = await request("GET", "/api/store", clerkCookie);
		expect(read.status).toBe(200);
		expect(await read.json()).toMatchObject({
			currency: "USD",
			velocityWindowDays: 30,
			lowStockCoverDays: 7,
		});

		const forbidden = await request("PATCH", "/api/store", clerkCookie, {
			velocityWindowDays: 45,
		});
		expect(forbidden.status).toBe(403);

		const immutableCurrency = await request(
			"PATCH",
			"/api/store",
			adminCookie,
			{ currency: "EUR" },
		);
		expect(immutableCurrency.status).toBe(400);
		expect((await immutableCurrency.json()) as ErrorBody).toMatchObject({
			code: "VALIDATION",
		});

		const updated = await request("PATCH", "/api/store", adminCookie, {
			name: "Updated Store",
			address: "2 Test Avenue",
			velocityWindowDays: 60,
			lowStockCoverDays: 14,
		});
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({
			name: "Updated Store",
			currency: "USD",
			velocityWindowDays: 60,
			lowStockCoverDays: 14,
		});
	});
});

describe("manager pricing", () => {
	test("price updates and audit snapshots commit together for drafts and published products", async () => {
		const manager = await createUser("price.manager", ["manager"]);
		const cookie = await createSessionCookie(manager.id);
		const product = await createProduct({ createdBy: manager.id, price: null });

		const first = await request(
			"PATCH",
			`/api/products/${product.id}/price`,
			cookie,
			{ price: "14.25" },
		);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({
			id: product.id,
			price: "14.25",
		});

		await testDb
			.update(products)
			.set({ published: true })
			.where(eq(products.id, product.id));
		const second = await request(
			"PATCH",
			`/api/products/${product.id}/price`,
			cookie,
			{ price: "15.00" },
		);
		expect(second.status).toBe(200);

		const [storedProduct] = await testDb
			.select({ price: products.price })
			.from(products)
			.where(eq(products.id, product.id));
		const auditRows = await testDb
			.select({
				oldPrice: priceChanges.oldPrice,
				newPrice: priceChanges.newPrice,
				changedBy: priceChanges.changedBy,
			})
			.from(priceChanges)
			.where(eq(priceChanges.productId, product.id));
		expect(storedProduct?.price).toBe("15.00");
		expect(auditRows).toEqual(
			expect.arrayContaining([
				{ oldPrice: null, newPrice: "14.25", changedBy: manager.id },
				{ oldPrice: "14.25", newPrice: "15.00", changedBy: manager.id },
			]),
		);

		const history = await request(
			"GET",
			`/api/products/${product.id}/price-history`,
			cookie,
		);
		expect(history.status).toBe(200);
		const body = (await history.json()) as Array<{
			oldPrice: string | null;
			newPrice: string;
		}>;
		expect(body).toHaveLength(2);
		expect(body[0]).toMatchObject({ oldPrice: "14.25", newPrice: "15.00" });

		const rollbackProduct = await createProduct({
			createdBy: manager.id,
			price: "5.00",
		});
		await expect(
			new PricingRepo(testDb).setPrice(
				rollbackProduct.id,
				"6.00",
				randomUUID(),
			),
		).rejects.toThrow();
		const [rolledBackProduct] = await testDb
			.select({ price: products.price })
			.from(products)
			.where(eq(products.id, rollbackProduct.id));
		const [rolledBackAuditCount] = await testDb
			.select({ value: count() })
			.from(priceChanges)
			.where(eq(priceChanges.productId, rollbackProduct.id));
		expect(rolledBackProduct?.price).toBe("5.00");
		expect(rolledBackAuditCount?.value).toBe(0);
	});

	test("archived products are rejected without a product or audit mutation", async () => {
		const manager = await createUser("archive-price.manager", ["manager"]);
		const product = await createProduct({
			createdBy: manager.id,
			price: "9.00",
			archived: true,
		});
		const response = await request(
			"PATCH",
			`/api/products/${product.id}/price`,
			await createSessionCookie(manager.id),
			{ price: "10.00" },
		);
		expect(response.status).toBe(409);
		expect((await response.json()) as ErrorBody).toMatchObject({
			code: "PRODUCT_ARCHIVED",
		});

		const [storedProduct] = await testDb
			.select({ price: products.price })
			.from(products)
			.where(eq(products.id, product.id));
		const [auditCount] = await testDb
			.select({ value: count() })
			.from(priceChanges)
			.where(eq(priceChanges.productId, product.id));
		expect(storedProduct?.price).toBe("9.00");
		expect(auditCount?.value).toBe(0);
	});

	test("sales clerks cannot set or view price history", async () => {
		const manager = await createUser("rbac-price.manager", ["manager"]);
		const clerk = await createUser("rbac-price.clerk", ["sales_clerk"]);
		const product = await createProduct({ createdBy: manager.id });
		const cookie = await createSessionCookie(clerk.id);

		expect(
			(
				await request("PATCH", `/api/products/${product.id}/price`, cookie, {
					price: "10.00",
				})
			).status,
		).toBe(403);
		expect(
			(
				await request(
					"GET",
					`/api/products/${product.id}/price-history`,
					cookie,
				)
			).status,
		).toBe(403);
	});
});

describe("suppliers and purchase orders", () => {
	test("supplier CRUD exposes balances and archive filtering", async () => {
		const manager = await createUser("supplier.manager", ["manager"]);
		const cookie = await createSessionCookie(manager.id);

		const createdResponse = await request("POST", "/api/suppliers", cookie, {
			name: "Acme Wholesale",
			phone: "555-0100",
			note: "Weekly delivery",
		});
		expect(createdResponse.status).toBe(201);
		const created = (await createdResponse.json()) as SupplierBody;
		expect(created).toMatchObject({
			outstandingBalance: "0.00",
			archived: false,
		});

		const updated = await request(
			"PATCH",
			`/api/suppliers/${created.id}`,
			cookie,
			{ name: "Acme Updated", phone: null },
		);
		expect(updated.status).toBe(200);
		expect((await updated.json()) as SupplierBody).toMatchObject({
			name: "Acme Updated",
			phone: null,
		});

		const archived = await request(
			"POST",
			`/api/suppliers/${created.id}/archive`,
			cookie,
		);
		expect(archived.status).toBe(200);

		const defaultList = await request("GET", "/api/suppliers", cookie);
		expect(await defaultList.json()).toEqual([]);
		const archivedList = await request(
			"GET",
			"/api/suppliers?archived=true",
			cookie,
		);
		expect((await archivedList.json()) as SupplierBody[]).toEqual([
			expect.objectContaining({ id: created.id, archived: true }),
		]);
	});

	test("PO creation snapshots costs and view responses include totals and product names", async () => {
		const manager = await createUser("po.manager", ["manager"]);
		const inventoryClerk = await createUser("po.inventory", [
			"inventory_clerk",
		]);
		const salesClerk = await createUser("po.sales", ["sales_clerk"]);
		const [supplier] = await testDb
			.insert(suppliers)
			.values({ name: "PO Supplier" })
			.returning({ id: suppliers.id });
		if (!supplier) {
			throw new Error("Failed to create test supplier.");
		}
		const product = await createProduct({
			createdBy: manager.id,
			bulkCost: "12.50",
		});

		const salesCreate = await request(
			"POST",
			"/api/purchase-orders",
			await createSessionCookie(salesClerk.id),
			{
				supplierId: supplier.id,
				lines: [{ productId: product.id, qtyBulk: 2 }],
			},
		);
		expect(salesCreate.status).toBe(403);

		const createResponse = await request(
			"POST",
			"/api/purchase-orders",
			await createSessionCookie(manager.id),
			{
				supplierId: supplier.id,
				lines: [{ productId: product.id, qtyBulk: 2 }],
			},
		);
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as PurchaseOrderBody;
		expect(created).toMatchObject({
			supplierName: "PO Supplier",
			status: "open",
		});
		expect(created.lines).toEqual([
			expect.objectContaining({
				productId: product.id,
				productName: product.name,
				qtyBulk: 2,
				bulkCostAtOrder: "12.50",
			}),
		]);

		await testDb
			.update(products)
			.set({ bulkCost: "99.00" })
			.where(eq(products.id, product.id));
		const [line] = await testDb
			.select({ cost: poLines.bulkCostAtOrder })
			.from(poLines)
			.where(eq(poLines.poId, created.id));
		expect(line?.cost).toBe("12.50");

		const inventoryCookie = await createSessionCookie(inventoryClerk.id);
		const list = await request(
			"GET",
			"/api/purchase-orders?status=open",
			inventoryCookie,
		);
		expect(list.status).toBe(200);
		expect(await list.json()).toEqual([
			expect.objectContaining({
				id: created.id,
				supplierName: "PO Supplier",
				lineCount: 1,
				totalValue: "25.00",
			}),
		]);

		const detail = await request(
			"GET",
			`/api/purchase-orders/${created.id}`,
			inventoryCookie,
		);
		expect(detail.status).toBe(200);
		expect((await detail.json()) as PurchaseOrderBody).toMatchObject({
			id: created.id,
			lines: [
				expect.objectContaining({
					productName: product.name,
					bulkCostAtOrder: "12.50",
				}),
			],
		});
	});

	test("PO creation rejects empty lines and archived suppliers or products", async () => {
		const manager = await createUser("po-validation.manager", ["manager"]);
		const cookie = await createSessionCookie(manager.id);
		const [supplier] = await testDb
			.insert(suppliers)
			.values({ name: "Active Supplier" })
			.returning({ id: suppliers.id });
		const [archivedSupplier] = await testDb
			.insert(suppliers)
			.values({ name: "Archived Supplier", archived: true })
			.returning({ id: suppliers.id });
		if (!supplier || !archivedSupplier) {
			throw new Error("Failed to create supplier fixtures.");
		}
		const activeProduct = await createProduct({ createdBy: manager.id });
		const archivedProduct = await createProduct({
			createdBy: manager.id,
			archived: true,
		});

		const empty = await request("POST", "/api/purchase-orders", cookie, {
			supplierId: supplier.id,
			lines: [],
		});
		expect(empty.status).toBe(400);

		const supplierResponse = await request(
			"POST",
			"/api/purchase-orders",
			cookie,
			{
				supplierId: archivedSupplier.id,
				lines: [{ productId: activeProduct.id, qtyBulk: 1 }],
			},
		);
		expect(supplierResponse.status).toBe(409);
		expect((await supplierResponse.json()) as ErrorBody).toMatchObject({
			code: "SUPPLIER_ARCHIVED",
		});

		const productResponse = await request(
			"POST",
			"/api/purchase-orders",
			cookie,
			{
				supplierId: supplier.id,
				lines: [{ productId: archivedProduct.id, qtyBulk: 1 }],
			},
		);
		expect(productResponse.status).toBe(409);
		expect((await productResponse.json()) as ErrorBody).toMatchObject({
			code: "PRODUCT_ARCHIVED",
		});
	});
});

describe("expenses and financial reporting", () => {
	test("expense CRUD uses exclusive date ranges and enforces manager RBAC", async () => {
		const manager = await createUser("expense.manager", ["manager"]);
		const clerk = await createUser("expense.clerk", ["sales_clerk"]);
		const managerCookie = await createSessionCookie(manager.id);
		const clerkCookie = await createSessionCookie(clerk.id);

		const forbidden = await request("POST", "/api/expenses", clerkCookie, {
			category: "rent",
			amount: "25.00",
			incurredOn: "2026-01-02",
		});
		expect(forbidden.status).toBe(403);

		const createdResponse = await request(
			"POST",
			"/api/expenses",
			managerCookie,
			{
				category: "transport",
				amount: "25.00",
				incurredOn: "2026-01-02",
				note: "Courier",
			},
		);
		expect(createdResponse.status).toBe(201);
		const created = (await createdResponse.json()) as { id: string };

		const list = await request(
			"GET",
			"/api/expenses?from=2026-01-01&to=2026-02-01",
			managerCookie,
		);
		expect(list.status).toBe(200);
		expect(await list.json()).toEqual([
			expect.objectContaining({ id: created.id, amount: "25.00" }),
		]);

		const updated = await request(
			"PATCH",
			`/api/expenses/${created.id}`,
			managerCookie,
			{ amount: "30.00", note: null },
		);
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({ amount: "30.00", note: null });

		const deleted = await request(
			"DELETE",
			`/api/expenses/${created.id}`,
			managerCookie,
		);
		expect(deleted.status).toBe(200);
		expect(await deleted.json()).toEqual({ success: true });
	});

	test("financial report reconciles exact SQL money sums", async () => {
		const manager = await createUser("report.manager", ["manager"]);
		const product = await createProduct({
			createdBy: manager.id,
			price: "10.00",
		});
		const [firstSale] = await testDb
			.insert(sales)
			.values({
				clerkId: manager.id,
				soldAt: new Date("2026-01-02T12:00:00.000Z"),
				type: "cash",
				total: "100.00",
				totalProfit: "40.00",
			})
			.returning({ id: sales.id });
		const [secondSale] = await testDb
			.insert(sales)
			.values({
				clerkId: manager.id,
				soldAt: new Date("2026-01-03T12:00:00.000Z"),
				type: "cash",
				total: "50.00",
				totalProfit: "30.00",
			})
			.returning({ id: sales.id });
		if (!firstSale || !secondSale) {
			throw new Error("Failed to create sale fixtures.");
		}
		await testDb.insert(saleLines).values([
			{
				saleId: firstSale.id,
				productId: product.id,
				qtyUnits: 10,
				unitPriceAtSale: "10.00",
				unitCostAtSale: "6.0000",
				lineCogs: "60.00",
				lineProfit: "40.00",
			},
			{
				saleId: secondSale.id,
				productId: product.id,
				qtyUnits: 5,
				unitPriceAtSale: "10.00",
				unitCostAtSale: "4.0000",
				lineCogs: "20.00",
				lineProfit: "30.00",
			},
		]);
		await testDb.insert(expenses).values([
			{
				category: "rent",
				amount: "25.00",
				incurredOn: "2026-01-02",
				recordedBy: manager.id,
			},
			{
				category: "utilities",
				amount: "10.00",
				incurredOn: "2026-01-03",
				recordedBy: manager.id,
			},
		]);

		const report = await request(
			"GET",
			"/api/reports/financial?from=2026-01-01&to=2026-02-01",
			await createSessionCookie(manager.id),
		);
		expect(report.status).toBe(200);
		expect(await report.json()).toEqual({
			revenue: "150.00",
			cogs: "80.00",
			grossProfit: "70.00",
			expensesTotal: "35.00",
			expensesByCategory: { rent: "25.00", utilities: "10.00" },
			netProfit: "35.00",
		});
	});

	test("a sale exactly at the UTC to boundary is excluded", async () => {
		const manager = await createUser("boundary.manager", ["manager"]);
		const product = await createProduct({ createdBy: manager.id });
		const [included, excluded] = await testDb
			.insert(sales)
			.values([
				{
					clerkId: manager.id,
					soldAt: new Date("2026-01-01T00:00:00.000Z"),
					type: "cash" as const,
					total: "10.00",
					totalProfit: "6.00",
				},
				{
					clerkId: manager.id,
					soldAt: new Date("2026-02-01T00:00:00.000Z"),
					type: "cash" as const,
					total: "90.00",
					totalProfit: "70.00",
				},
			])
			.returning({ id: sales.id });
		if (!included || !excluded) {
			throw new Error("Failed to create boundary fixtures.");
		}
		await testDb.insert(saleLines).values([
			{
				saleId: included.id,
				productId: product.id,
				qtyUnits: 1,
				unitPriceAtSale: "10.00",
				unitCostAtSale: "4.0000",
				lineCogs: "4.00",
				lineProfit: "6.00",
			},
			{
				saleId: excluded.id,
				productId: product.id,
				qtyUnits: 1,
				unitPriceAtSale: "90.00",
				unitCostAtSale: "20.0000",
				lineCogs: "20.00",
				lineProfit: "70.00",
			},
		]);

		const response = await request(
			"GET",
			"/api/reports/financial?from=2026-01-01&to=2026-02-01",
			await createSessionCookie(manager.id),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			revenue: "10.00",
			cogs: "4.00",
			grossProfit: "6.00",
			netProfit: "6.00",
		});

		const invalidPeriod = await request(
			"GET",
			"/api/reports/financial?from=2026-02-01&to=2026-02-01",
			await createSessionCookie(manager.id),
		);
		expect(invalidPeriod.status).toBe(400);
	});
});
