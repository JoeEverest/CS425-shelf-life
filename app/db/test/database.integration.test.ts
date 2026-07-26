import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { count, eq } from "drizzle-orm";
import {
	categories,
	customers,
	invoices,
	products,
	sales,
	stockLevels,
	supplierPayments,
	suppliers,
	users,
} from "../src/schema";
import {
	closeTestDatabase,
	migrateTestDatabase,
	testDb,
	truncateTables,
} from "./database";

async function createUser(username = "test-user") {
	const [user] = await testDb
		.insert(users)
		.values({
			name: "Test User",
			username,
			passwordHash: "test-password-hash",
		})
		.returning({ id: users.id });

	if (!user) {
		throw new Error("Failed to create test user.");
	}

	return user;
}

async function createValidProduct() {
	const user = await createUser();
	const [category] = await testDb
		.insert(categories)
		.values({ name: "Test Category" })
		.returning({ id: categories.id });

	if (!category) {
		throw new Error("Failed to create test category.");
	}

	const [product] = await testDb
		.insert(products)
		.values({
			sku: "TEST-SKU",
			name: "Test Product",
			categoryId: category.id,
			bulkUnitName: "case",
			unitsPerBulk: 12,
			saleUnitName: "unit",
			bulkCost: "12.00",
			price: "2.00",
			createdBy: user.id,
		})
		.returning({ id: products.id });

	if (!product) {
		throw new Error("Failed to create test product.");
	}

	return product;
}

beforeAll(migrateTestDatabase);
beforeEach(truncateTables);
afterAll(closeTestDatabase);

describe("database transaction guarantees", () => {
	test("an error after multiple writes rolls back the complete transaction", async () => {
		const user = await createUser();

		const transaction = testDb.transaction(async (tx) => {
			const [category] = await tx
				.insert(categories)
				.values({ name: "Rolled Back Category" })
				.returning({ id: categories.id });

			if (!category) {
				throw new Error("Failed to create transaction category.");
			}

			const [product] = await tx
				.insert(products)
				.values({
					sku: "ROLLBACK-SKU",
					name: "Rolled Back Product",
					categoryId: category.id,
					bulkUnitName: "box",
					unitsPerBulk: 5,
					saleUnitName: "unit",
					bulkCost: "10.00",
					createdBy: user.id,
				})
				.returning({ id: products.id });

			if (!product) {
				throw new Error("Failed to create transaction product.");
			}

			await tx.insert(stockLevels).values({
				productId: product.id,
				qtyUnits: -1,
			});
		});

		await expect(transaction).rejects.toThrow();

		const [categoryCount] = await testDb
			.select({ value: count() })
			.from(categories)
			.where(eq(categories.name, "Rolled Back Category"));
		const [productCount] = await testDb
			.select({ value: count() })
			.from(products)
			.where(eq(products.sku, "ROLLBACK-SKU"));

		expect(categoryCount?.value).toBe(0);
		expect(productCount?.value).toBe(0);
	});
});

describe("database CHECK constraints", () => {
	test("reject negative stock_levels.qty_units", async () => {
		const product = await createValidProduct();

		await expect(
			testDb
				.insert(stockLevels)
				.values({
					productId: product.id,
					qtyUnits: -1,
				})
				.execute(),
		).rejects.toThrow();
	});

	test("reject products.units_per_bulk equal to zero", async () => {
		const user = await createUser();
		const [category] = await testDb
			.insert(categories)
			.values({ name: "Invalid Product Category" })
			.returning({ id: categories.id });

		if (!category) {
			throw new Error("Failed to create test category.");
		}

		await expect(
			testDb
				.insert(products)
				.values({
					sku: "ZERO-BULK",
					name: "Invalid Product",
					categoryId: category.id,
					bulkUnitName: "case",
					unitsPerBulk: 0,
					saleUnitName: "unit",
					bulkCost: "10.00",
					createdBy: user.id,
				})
				.execute(),
		).rejects.toThrow();
	});

	test("reject supplier_payments.amount equal to zero", async () => {
		const user = await createUser();
		const [supplier] = await testDb
			.insert(suppliers)
			.values({ name: "Test Supplier", phone: "555-0101", note: "Test" })
			.returning({ id: suppliers.id });

		if (!supplier) {
			throw new Error("Failed to create test supplier.");
		}

		await expect(
			testDb
				.insert(supplierPayments)
				.values({
					supplierId: supplier.id,
					amount: "0.00",
					paidAt: new Date(),
					recordedBy: user.id,
				})
				.execute(),
		).rejects.toThrow();
	});

	test("reject invoices.balance below zero", async () => {
		const user = await createUser();
		const [customer] = await testDb
			.insert(customers)
			.values({ name: "Test Customer", phone: "555-0102" })
			.returning({ id: customers.id });
		const [sale] = await testDb
			.insert(sales)
			.values({
				clerkId: user.id,
				type: "credit",
				total: "10.00",
				totalProfit: "2.00",
			})
			.returning({ id: sales.id });

		if (!customer || !sale) {
			throw new Error("Failed to create invoice fixtures.");
		}

		await expect(
			testDb
				.insert(invoices)
				.values({
					saleId: sale.id,
					customerId: customer.id,
					total: "10.00",
					balance: "-0.01",
				})
				.execute(),
		).rejects.toThrow();
	});
});
