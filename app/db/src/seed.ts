import { randomUUID } from "node:crypto";
import { readDatabaseEnv } from "./env";
import { client, createDb } from "./index";
import {
	categories,
	products,
	type roleEnum,
	saleLines,
	sales,
	stockLevels,
	stockMovements,
	stores,
	suppliers,
	userRoles,
	users,
} from "./schema";

type Role = (typeof roleEnum.enumValues)[number];

type ProductDefinition = {
	id: string;
	sku: string;
	name: string;
	category: "Food" | "Household" | "Stationery";
	bulkUnitName: string;
	unitsPerBulk: number;
	saleUnitName: string;
	bulkCost: string;
	price: string | null;
	initialQty: number;
};

type SalePlan = {
	daysAgo: number;
	lines: Array<{ sku: string; qty: number }>;
};

const userDefinitions: Array<{
	id: string;
	name: string;
	username: string;
	role: Role;
}> = [
	{ id: randomUUID(), name: "Alex Admin", username: "admin", role: "admin" },
	{
		id: randomUUID(),
		name: "Morgan Manager",
		username: "manager",
		role: "manager",
	},
	{
		id: randomUUID(),
		name: "Casey Clerk",
		username: "sales.clerk",
		role: "sales_clerk",
	},
	{
		id: randomUUID(),
		name: "Riley Stock",
		username: "inventory.clerk",
		role: "inventory_clerk",
	},
	{
		id: randomUUID(),
		name: "Taylor Accounts",
		username: "accountant",
		role: "accountant",
	},
];

const categoryDefinitions = ["Food", "Household", "Stationery"] as const;

const categoryIds = Object.fromEntries(
	categoryDefinitions.map((name) => [name, randomUUID()]),
) as Record<(typeof categoryDefinitions)[number], string>;

const productDefinitions: ProductDefinition[] = [
	{
		id: randomUUID(),
		sku: "RICE-25KG",
		name: "Long Grain Rice",
		category: "Food",
		bulkUnitName: "bag",
		unitsPerBulk: 25,
		saleUnitName: "kilogram",
		bulkCost: "30.00",
		price: "1.75",
		initialQty: 250,
	},
	{
		id: randomUUID(),
		sku: "SODA-COLA-24",
		name: "Cola",
		category: "Food",
		bulkUnitName: "case",
		unitsPerBulk: 24,
		saleUnitName: "can",
		bulkCost: "14.40",
		price: "1.00",
		initialQty: 240,
	},
	{
		id: randomUUID(),
		sku: "SOAP-BAR-12",
		name: "Bath Soap",
		category: "Household",
		bulkUnitName: "carton",
		unitsPerBulk: 12,
		saleUnitName: "bar",
		bulkCost: "18.00",
		price: "2.25",
		initialQty: 120,
	},
	{
		id: randomUUID(),
		sku: "NOTE-A5-10",
		name: "A5 Notebook",
		category: "Stationery",
		bulkUnitName: "pack",
		unitsPerBulk: 10,
		saleUnitName: "book",
		bulkCost: "12.50",
		price: "2.00",
		initialQty: 100,
	},
	{
		id: randomUUID(),
		sku: "BATTERY-AA-8",
		name: "AA Battery Pair",
		category: "Household",
		bulkUnitName: "display",
		unitsPerBulk: 8,
		saleUnitName: "pair",
		bulkCost: "20.00",
		price: "4.00",
		initialQty: 80,
	},
	{
		id: randomUUID(),
		sku: "OIL-1L-6",
		name: "Cooking Oil 1L",
		category: "Food",
		bulkUnitName: "carton",
		unitsPerBulk: 6,
		saleUnitName: "bottle",
		bulkCost: "42.00",
		price: null,
		initialQty: 60,
	},
];

const salePlans: SalePlan[] = [
	{
		daysAgo: 9,
		lines: [
			{ sku: "RICE-25KG", qty: 4 },
			{ sku: "SODA-COLA-24", qty: 3 },
		],
	},
	{
		daysAgo: 8,
		lines: [
			{ sku: "SOAP-BAR-12", qty: 2 },
			{ sku: "NOTE-A5-10", qty: 1 },
		],
	},
	{
		daysAgo: 7,
		lines: [
			{ sku: "BATTERY-AA-8", qty: 1 },
			{ sku: "SODA-COLA-24", qty: 5 },
		],
	},
	{
		daysAgo: 6,
		lines: [
			{ sku: "RICE-25KG", qty: 6 },
			{ sku: "SOAP-BAR-12", qty: 1 },
		],
	},
	{
		daysAgo: 5,
		lines: [
			{ sku: "NOTE-A5-10", qty: 3 },
			{ sku: "SODA-COLA-24", qty: 2 },
		],
	},
	{
		daysAgo: 4,
		lines: [
			{ sku: "BATTERY-AA-8", qty: 2 },
			{ sku: "SOAP-BAR-12", qty: 2 },
		],
	},
	{
		daysAgo: 3,
		lines: [
			{ sku: "RICE-25KG", qty: 3 },
			{ sku: "NOTE-A5-10", qty: 2 },
		],
	},
	{
		daysAgo: 2,
		lines: [
			{ sku: "SODA-COLA-24", qty: 4 },
			{ sku: "BATTERY-AA-8", qty: 1 },
		],
	},
	{
		daysAgo: 1,
		lines: [
			{ sku: "SOAP-BAR-12", qty: 3 },
			{ sku: "RICE-25KG", qty: 2 },
		],
	},
	{
		daysAgo: 0,
		lines: [
			{ sku: "NOTE-A5-10", qty: 1 },
			{ sku: "SODA-COLA-24", qty: 6 },
		],
	},
];

function moneyToCents(value: string): number {
	const [whole = "0", fraction = ""] = value.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function centsToMoney(value: number): string {
	return (value / 100).toFixed(2);
}

function soldAt(daysAgo: number): Date {
	const timestamp = new Date();
	timestamp.setUTCDate(timestamp.getUTCDate() - daysAgo);
	timestamp.setUTCHours(15, 0, 0, 0);
	// Never stamp the future (seeding before 15:00 UTC on day 0).
	const now = new Date();
	return timestamp > now ? now : timestamp;
}

// Initial deliveries land before the earliest sale so a chronological replay
// of the ledger never goes negative (BR-NoNegativeStock holds historically).
function initialStockAt(): Date {
	return soldAt(10);
}

async function seed() {
	const env = readDatabaseEnv();
	const queryClient = client(env.DATABASE_URL);
	const db = createDb(queryClient);
	const passwordHashes = new Map(
		await Promise.all(
			userDefinitions.map(
				async (user) =>
					[
						user.id,
						await Bun.password.hash("password123", { algorithm: "argon2id" }),
					] as const,
			),
		),
	);

	try {
		await db.transaction(async (tx) => {
			const [existingStore] = await tx
				.select({ id: stores.id })
				.from(stores)
				.limit(1);

			if (existingStore) {
				throw new Error(
					"Seed refused: a store row already exists. Use an empty database.",
				);
			}

			const storeId = randomUUID();
			const supplierId = randomUUID();
			const inventoryClerk = userDefinitions.find(
				(user) => user.role === "inventory_clerk",
			);
			const salesClerk = userDefinitions.find(
				(user) => user.role === "sales_clerk",
			);
			const admin = userDefinitions.find((user) => user.role === "admin");

			if (!inventoryClerk || !salesClerk || !admin) {
				throw new Error("Seed user definitions are incomplete.");
			}

			await tx.insert(stores).values({
				id: storeId,
				name: "ShelfLife General Store",
				currency: "USD",
				address: "100 Market Street",
			});

			await tx.insert(users).values(
				userDefinitions.map(({ role: _role, ...user }) => ({
					...user,
					passwordHash: passwordHashes.get(user.id) as string,
				})),
			);

			await tx
				.insert(userRoles)
				.values(
					userDefinitions.map((user) => ({ userId: user.id, role: user.role })),
				);

			await tx
				.insert(categories)
				.values(
					categoryDefinitions.map((name) => ({ id: categoryIds[name], name })),
				);

			await tx.insert(products).values(
				productDefinitions.map((product) => ({
					id: product.id,
					sku: product.sku,
					name: product.name,
					categoryId: categoryIds[product.category],
					bulkUnitName: product.bulkUnitName,
					unitsPerBulk: product.unitsPerBulk,
					saleUnitName: product.saleUnitName,
					bulkCost: product.bulkCost,
					price: product.price,
					published: true,
					createdBy: admin.id,
				})),
			);

			await tx.insert(suppliers).values({
				id: supplierId,
				name: "Main Street Wholesale",
				phone: "+1-555-0100",
				note: "Demo supplier",
			});

			const productsBySku = new Map(
				productDefinitions.map((product) => [product.sku, product]),
			);
			const soldByProductId = new Map<string, number>();
			const saleRows: Array<typeof sales.$inferInsert> = [];
			const saleLineRows: Array<typeof saleLines.$inferInsert> = [];
			const saleMovementRows: Array<typeof stockMovements.$inferInsert> = [];

			for (const plan of salePlans) {
				const saleId = randomUUID();
				const saleDate = soldAt(plan.daysAgo);
				let saleTotalCents = 0;
				let saleProfitCents = 0;

				for (const plannedLine of plan.lines) {
					const product = productsBySku.get(plannedLine.sku);
					if (!product?.price) {
						throw new Error(
							`Cannot seed sale for unpriced SKU ${plannedLine.sku}.`,
						);
					}

					const lineId = randomUUID();
					const revenueCents = moneyToCents(product.price) * plannedLine.qty;
					const exactCogsCents =
						(moneyToCents(product.bulkCost) * plannedLine.qty) /
						product.unitsPerBulk;
					const lineCogsCents = Math.floor(exactCogsCents + 0.5);
					const lineProfitCents = revenueCents - lineCogsCents;

					saleTotalCents += revenueCents;
					saleProfitCents += lineProfitCents;
					soldByProductId.set(
						product.id,
						(soldByProductId.get(product.id) ?? 0) + plannedLine.qty,
					);

					saleLineRows.push({
						id: lineId,
						saleId,
						productId: product.id,
						qtyUnits: plannedLine.qty,
						unitPriceAtSale: product.price,
						unitCostAtSale: (
							Number(product.bulkCost) / product.unitsPerBulk
						).toFixed(4),
						lineCogs: centsToMoney(lineCogsCents),
						lineProfit: centsToMoney(lineProfitCents),
					});

					saleMovementRows.push({
						productId: product.id,
						deltaUnits: -plannedLine.qty,
						reason: "sale",
						refTable: "sale_lines",
						refId: lineId,
						actorId: salesClerk.id,
						occurredAt: saleDate,
					});
				}

				saleRows.push({
					id: saleId,
					clerkId: salesClerk.id,
					soldAt: saleDate,
					type: "cash",
					total: centsToMoney(saleTotalCents),
					totalProfit: centsToMoney(saleProfitCents),
				});
			}

			await tx.insert(sales).values(saleRows);
			await tx.insert(saleLines).values(saleLineRows);

			await tx.insert(stockMovements).values([
				...productDefinitions.map((product) => ({
					productId: product.id,
					deltaUnits: product.initialQty,
					reason: "delivery" as const,
					refTable: "seed_initial_stock",
					refId: supplierId,
					actorId: inventoryClerk.id,
					occurredAt: initialStockAt(),
				})),
				...saleMovementRows,
			]);

			await tx.insert(stockLevels).values(
				productDefinitions.map((product) => ({
					productId: product.id,
					qtyUnits: product.initialQty - (soldByProductId.get(product.id) ?? 0),
				})),
			);
		});

		console.log("ShelfLife demo data seeded successfully.");
	} finally {
		await queryClient.end();
	}
}

await seed();
