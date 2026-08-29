import { randomUUID } from "node:crypto";
import { count, eq, like } from "drizzle-orm";
import { readDatabaseEnv } from "./env";
import { client, createDb, type Database } from "./index";
import {
	categories,
	customerPayments,
	customers,
	expenses,
	goodsReceipts,
	invoices,
	poLines,
	products,
	purchaseOrders,
	receiptLines,
	saleLines,
	sales,
	stockLevels,
	stockMovements,
	stores,
	supplierPayments,
	suppliers,
	userRoles,
	users,
} from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type CategoryDefinition = {
	name: string;
	bulkUnitName: string;
	saleUnitName: string;
	products: string[];
};

type DemoProduct = {
	id: string;
	sku: string;
	supplierIndex: number;
	unitsPerBulk: number;
	bulkCostCents: number;
	bulkCost: string;
	price: string | null;
	popularity: number;
	soldBeforeRestock: number;
	soldTotal: number;
	writeOffUnits: number;
	openingBulk: number;
	restockBulk: number;
};

// A fixed seed keeps every run on a clean database identical, so screenshots
// and manual test scripts stay valid between runs.
const DEMO_SEED = 0x425d3a7a;
const DEMO_SKU_PREFIX = "DM-";
const MAX_INSERT_ROWS = 500;
const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SALE_DAYS = 30;
// The restock delivery lands on this day, before that day's first sale.
const RESTOCK_DAYS_AGO = 14;
const OPENING_DAYS_AGO = SALE_DAYS + 1;
const OPEN_DAYS_AGO = 2;
const TRADING_OPEN_MINUTE = 8 * 60;
const TRADING_CLOSE_MINUTE = 19 * 60;
const DELIVERY_MINUTE = 7 * 60 + 30;
const BULK_SIZES = [6, 8, 10, 12, 16, 24];
const WRITE_OFF_COUNT = 10;
const WRITE_OFF_DAYS_AGO = 5;

const categoryDefinitions: CategoryDefinition[] = [
	{
		name: "Beverages",
		bulkUnitName: "case",
		saleUnitName: "bottle",
		products: [
			"Sparkling Water",
			"Orange Juice",
			"Cola Drink",
			"Ginger Ale",
			"Malt Drink",
			"Iced Tea",
			"Energy Drink",
			"Bottled Water",
		],
	},
	{
		name: "Breakfast",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Corn Flakes",
			"Rolled Oats",
			"Granola",
			"Pancake Mix",
			"Honey Jar",
			"Peanut Butter",
		],
	},
	{
		name: "Canned Goods",
		bulkUnitName: "carton",
		saleUnitName: "can",
		products: [
			"Baked Beans",
			"Sweet Corn",
			"Tomato Paste",
			"Tuna Chunks",
			"Green Peas",
			"Coconut Milk",
			"Canned Sardines",
		],
	},
	{
		name: "Snacks",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Potato Crisps",
			"Plantain Chips",
			"Salted Peanuts",
			"Crackers",
			"Popcorn",
			"Chocolate Bar",
			"Sweet Biscuits",
			"Chewing Gum",
			"Trail Mix",
		],
	},
	{
		name: "Baking Supplies",
		bulkUnitName: "sack",
		saleUnitName: "pack",
		products: [
			"Wheat Flour",
			"Brown Sugar",
			"Baking Powder",
			"Vanilla Essence",
			"Cocoa Powder",
			"Dry Yeast",
			"Icing Sugar",
		],
	},
	{
		name: "Condiments",
		bulkUnitName: "carton",
		saleUnitName: "bottle",
		products: [
			"Tomato Ketchup",
			"Mayonnaise",
			"Hot Pepper Sauce",
			"Soy Sauce",
			"Mustard",
			"Salad Dressing",
		],
	},
	{
		name: "Dairy",
		bulkUnitName: "crate",
		saleUnitName: "pack",
		products: [
			"UHT Milk",
			"Powdered Milk",
			"Cheddar Cheese",
			"Yogurt Cup",
			"Butter",
			"Coffee Creamer",
		],
	},
	{
		name: "Personal Care",
		bulkUnitName: "carton",
		saleUnitName: "piece",
		products: [
			"Toothpaste",
			"Toothbrush",
			"Body Lotion",
			"Deodorant",
			"Shampoo",
			"Petroleum Jelly",
			"Shower Gel",
			"Razor Pack",
		],
	},
	{
		name: "Baby Care",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Baby Wipes",
			"Baby Powder",
			"Infant Cereal",
			"Baby Soap",
			"Small Diapers",
			"Large Diapers",
		],
	},
	{
		name: "Laundry",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Washing Powder",
			"Laundry Bar",
			"Fabric Softener",
			"Bleach",
			"Stain Remover",
			"Clothes Pegs",
		],
	},
	{
		name: "Cleaning",
		bulkUnitName: "carton",
		saleUnitName: "bottle",
		products: [
			"Dishwashing Liquid",
			"Floor Cleaner",
			"Glass Cleaner",
			"Disinfectant",
			"Scrub Sponge",
			"Trash Bags",
			"Toilet Cleaner",
		],
	},
	{
		name: "Kitchen Supplies",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Aluminum Foil",
			"Cling Film",
			"Paper Towels",
			"Food Containers",
			"Plastic Cups",
			"Sandwich Bags",
		],
	},
	{
		name: "Home Essentials",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Toilet Tissue",
			"Facial Tissue",
			"Air Freshener",
			"Light Bulb",
			"Match Box",
			"Candle Pack",
			"Mosquito Coil",
		],
	},
	{
		name: "Pet Supplies",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Dog Food",
			"Cat Food",
			"Pet Treats",
			"Cat Litter",
			"Pet Shampoo",
		],
	},
	{
		name: "Health and Wellness",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Vitamin C Tablets",
			"Adhesive Bandages",
			"Hand Sanitizer",
			"Face Masks",
			"Cotton Wool",
			"Antiseptic Liquid",
			"Pain Relief Tablets",
		],
	},
	{
		name: "Electronics",
		bulkUnitName: "display",
		saleUnitName: "piece",
		products: [
			"AA Batteries",
			"AAA Batteries",
			"USB Cable",
			"Phone Charger",
			"Extension Cord",
			"LED Torch",
		],
	},
	{
		name: "Hardware",
		bulkUnitName: "box",
		saleUnitName: "piece",
		products: [
			"Padlock",
			"Packing Tape",
			"Super Glue",
			"Work Gloves",
			"Screwdriver",
			"Rope Coil",
		],
	},
	{
		name: "Party Supplies",
		bulkUnitName: "carton",
		saleUnitName: "pack",
		products: [
			"Paper Plates",
			"Paper Napkins",
			"Birthday Candles",
			"Balloons",
			"Gift Bags",
		],
	},
	{
		name: "School Supplies",
		bulkUnitName: "box",
		saleUnitName: "pack",
		products: [
			"Ballpoint Pens",
			"Pencils",
			"Erasers",
			"Colored Pencils",
			"Glue Sticks",
			"Exercise Books",
			"Rulers",
			"Pencil Sharpeners",
		],
	},
	{
		name: "Frozen Foods",
		bulkUnitName: "crate",
		saleUnitName: "pack",
		products: [
			"Frozen Peas",
			"French Fries",
			"Chicken Nuggets",
			"Fish Fillets",
			"Ice Cream Tub",
		],
	},
];

const supplierDefinitions: Array<[string, string]> = [
	["Harbor Wholesale Foods", "+1-555-0201"],
	["Northstar Home Supply", "+1-555-0202"],
	["Greenline Distributors", "+1-555-0203"],
	["Metro Health and Beauty", "+1-555-0204"],
	["Summit School and Office", "+1-555-0205"],
	["Cold Chain Provisions", "+1-555-0206"],
];

const customerDefinitions: Array<[string, string]> = [
	["Avery Johnson", "+1-555-0301"],
	["Jordan Williams", "+1-555-0302"],
	["Cameron Brown", "+1-555-0303"],
	["Parker Davis", "+1-555-0304"],
	["Quinn Miller", "+1-555-0305"],
	["Reese Wilson", "+1-555-0306"],
	["Skyler Moore", "+1-555-0307"],
	["Emerson Taylor", "+1-555-0308"],
	["Rowan Anderson", "+1-555-0309"],
	["Finley Thomas", "+1-555-0310"],
];

const expensePlan: Array<{
	category: "rent" | "transport" | "delivery" | "salaries" | "utilities";
	count: number;
	minCents: number;
	maxCents: number;
	note: string;
}> = [
	{
		category: "rent",
		count: 1,
		minCents: 150_000,
		maxCents: 180_000,
		note: "Monthly shop rent",
	},
	{
		category: "salaries",
		count: 2,
		minCents: 90_000,
		maxCents: 140_000,
		note: "Staff wages",
	},
	{
		category: "utilities",
		count: 3,
		minCents: 14_000,
		maxCents: 42_000,
		note: "Power and water",
	},
	{
		category: "transport",
		count: 8,
		minCents: 2_500,
		maxCents: 12_000,
		note: "Stock run transport",
	},
	{
		category: "delivery",
		count: 8,
		minCents: 3_500,
		maxCents: 16_000,
		note: "Customer delivery run",
	},
];

function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function randomInt(
	random: () => number,
	minimum: number,
	maximum: number,
): number {
	return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function pick<T>(random: () => number, values: readonly T[], fallback: T): T {
	return values[randomInt(random, 0, values.length - 1)] ?? fallback;
}

function moneyToCents(value: string): number {
	const [whole = "0", fraction = ""] = value.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function centsToMoney(value: number): string {
	return (value / 100).toFixed(2);
}

function dateAtDaysAgo(now: Date, daysAgo: number, minuteOfDay: number): Date {
	const value = new Date(now);
	value.setUTCDate(value.getUTCDate() - daysAgo);
	value.setUTCHours(0, minuteOfDay, 0, 0);
	return value;
}

function dateOnly(value: Date): string {
	return value.toISOString().slice(0, 10);
}

/**
 * Trading hours are 08:00 to 19:00 UTC. Day 0 is cut short at the current time
 * so no sale is stamped in the future. If the run happens before opening time,
 * day 0 falls back to the elapsed part of the day so the dashboard still shows
 * thirty populated days.
 */
function tradingWindow(
	now: Date,
	daysAgo: number,
): { start: number; end: number } | undefined {
	if (daysAgo > 0) {
		return { start: TRADING_OPEN_MINUTE, end: TRADING_CLOSE_MINUTE };
	}

	const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
	if (nowMinute >= TRADING_OPEN_MINUTE) {
		const end = Math.min(TRADING_CLOSE_MINUTE, nowMinute);
		return end - TRADING_OPEN_MINUTE >= 15
			? { start: TRADING_OPEN_MINUTE, end }
			: undefined;
	}

	const start = Math.max(0, nowMinute - 4 * 60);
	return nowMinute - start >= 15 ? { start, end: nowMinute } : undefined;
}

async function insertInChunks<T>(
	rows: T[],
	insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
	for (let index = 0; index < rows.length; index += MAX_INSERT_ROWS) {
		await insert(rows.slice(index, index + MAX_INSERT_ROWS));
	}
}

async function findRequiredUser(
	tx: Transaction,
	role: "admin" | "sales_clerk" | "inventory_clerk" | "accountant",
): Promise<string> {
	const [user] = await tx
		.select({ id: users.id })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.where(eq(userRoles.role, role))
		.limit(1);
	if (!user) {
		throw new Error(
			`Demo data requires an existing ${role} user. Run "bun run db:seed" first.`,
		);
	}
	return user.id;
}

async function generateDemoData() {
	const env = readDatabaseEnv();
	const queryClient = client(env.DATABASE_URL);
	const db = createDb(queryClient);
	const random = mulberry32(DEMO_SEED);

	try {
		const summary = await db.transaction(async (tx) => {
			const [demoCount] = await tx
				.select({ value: count(products.id) })
				.from(products)
				.where(like(products.sku, `${DEMO_SKU_PREFIX}%`));
			if ((demoCount?.value ?? 0) > 0) {
				throw new Error(
					`Demo data is already present (${demoCount?.value} products with the ${DEMO_SKU_PREFIX} prefix). This script never deletes rows. For a clean slate run: bun run db:reset && bun run db:migrate && bun run db:seed && bun run db:demo`,
				);
			}

			const [store] = await tx.select({ id: stores.id }).from(stores).limit(1);
			if (!store) {
				throw new Error(
					'Demo data requires an existing store. Run "bun run db:seed" first.',
				);
			}

			const adminId = await findRequiredUser(tx, "admin");
			const salesClerkId = await findRequiredUser(tx, "sales_clerk");
			const inventoryClerkId = await findRequiredUser(tx, "inventory_clerk");
			const accountantId = await findRequiredUser(tx, "accountant");
			const now = new Date();

			// ---- Catalog -------------------------------------------------------
			const categoryRows: Array<typeof categories.$inferInsert> = [];
			const productRows: Array<typeof products.$inferInsert> = [];
			const demoProducts: DemoProduct[] = [];
			let productOrdinal = 0;

			for (const [categoryIndex, definition] of categoryDefinitions.entries()) {
				const categoryId = randomUUID();
				categoryRows.push({ id: categoryId, name: definition.name });

				for (const [productIndex, name] of definition.products.entries()) {
					productOrdinal += 1;
					const id = randomUUID();
					const unitsPerBulk = pick(random, BULK_SIZES, 12);
					const unitCostCents = randomInt(random, 40, 900);
					const bulkCostCents = unitCostCents * unitsPerBulk;
					const bulkCost = centsToMoney(bulkCostCents);
					// Roughly one product in seventeen is still waiting for a price,
					// so the pricing screen has real work to show.
					const unpriced = productOrdinal % 17 === 0;
					const price = unpriced
						? null
						: centsToMoney(
								Math.ceil((unitCostCents * randomInt(random, 145, 190)) / 100),
							);
					const sku = `${DEMO_SKU_PREFIX}${String(categoryIndex + 1).padStart(2, "0")}-${String(productIndex + 1).padStart(2, "0")}`;

					productRows.push({
						id,
						sku,
						name,
						categoryId,
						bulkUnitName: definition.bulkUnitName,
						unitsPerBulk,
						saleUnitName: definition.saleUnitName,
						bulkCost,
						price,
						published: true,
						archived: false,
						createdBy: adminId,
					});
					demoProducts.push({
						id,
						sku,
						supplierIndex: categoryIndex % supplierDefinitions.length,
						unitsPerBulk,
						bulkCostCents,
						bulkCost,
						price,
						popularity: randomInt(random, 1, 5),
						soldBeforeRestock: 0,
						soldTotal: 0,
						writeOffUnits: 0,
						openingBulk: 0,
						restockBulk: 0,
					});
				}
			}

			// ---- Sales ---------------------------------------------------------
			// Demand is generated first and the deliveries are sized afterwards, so
			// every sale is always backed by stock that arrived before it.
			const supplierIds = supplierDefinitions.map(() => randomUUID());
			const customerIds = customerDefinitions.map(() => randomUUID());
			const customerOutstanding = customerDefinitions.map(() => 0);
			const saleRows: Array<typeof sales.$inferInsert> = [];
			const saleLineRows: Array<typeof saleLines.$inferInsert> = [];
			const invoiceRows: Array<typeof invoices.$inferInsert> = [];
			const customerPaymentRows: Array<typeof customerPayments.$inferInsert> =
				[];
			const stockMovementRows: Array<typeof stockMovements.$inferInsert> = [];

			const sellableProducts = demoProducts.filter(
				(product) => product.price !== null,
			);
			if (sellableProducts.length === 0) {
				throw new Error("Demo data produced no sellable products.");
			}
			// A weighted pool makes popular lines move faster than slow movers, so
			// the velocity and stock-alert screens show a realistic spread.
			const demandPool: DemoProduct[] = [];
			for (const product of sellableProducts) {
				for (let copy = 0; copy < product.popularity; copy += 1) {
					demandPool.push(product);
				}
			}

			let creditIndex = 0;
			let daysWithSales = 0;

			for (let daysAgo = SALE_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
				const window = tradingWindow(now, daysAgo);
				if (!window) {
					continue;
				}
				daysWithSales += 1;

				const salesToday = randomInt(random, 10, 15);
				const span = window.end - window.start;
				for (let saleIndex = 0; saleIndex < salesToday; saleIndex += 1) {
					const slot = Math.floor((saleIndex * span) / salesToday);
					const jitter = randomInt(
						random,
						0,
						Math.max(0, Math.floor(span / salesToday) - 1),
					);
					const saleAt = dateAtDaysAgo(
						now,
						daysAgo,
						window.start + Math.min(span, slot + jitter),
					);

					const saleId = randomUUID();
					const credit = random() < 0.3;
					const lineCount = randomInt(random, 1, 4);
					const chosen = new Set<string>();
					const linesForSale: Array<typeof saleLines.$inferInsert> = [];
					let totalCents = 0;
					let profitCents = 0;

					for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
						const product = pick(
							random,
							demandPool,
							sellableProducts[0] as DemoProduct,
						);
						if (product.price === null || chosen.has(product.id)) {
							continue;
						}
						chosen.add(product.id);

						const lineId = randomUUID();
						const qtyUnits = randomInt(random, 1, 5);
						// These three lines mirror sales-repo.ts exactly: the unit cost
						// is bulkCost/unitsPerBulk to four places and the COGS is the
						// bulk cost prorated over the sold units, rounded half up.
						const revenueCents = moneyToCents(product.price) * qtyUnits;
						const lineCogsCents = Math.floor(
							(product.bulkCostCents * qtyUnits) / product.unitsPerBulk + 0.5,
						);
						const lineProfitCents = revenueCents - lineCogsCents;
						totalCents += revenueCents;
						profitCents += lineProfitCents;

						product.soldTotal += qtyUnits;
						if (daysAgo > RESTOCK_DAYS_AGO) {
							product.soldBeforeRestock += qtyUnits;
						}

						linesForSale.push({
							id: lineId,
							saleId,
							productId: product.id,
							qtyUnits,
							unitPriceAtSale: product.price,
							unitCostAtSale: (
								product.bulkCostCents /
								100 /
								product.unitsPerBulk
							).toFixed(4),
							lineCogs: centsToMoney(lineCogsCents),
							lineProfit: centsToMoney(lineProfitCents),
							createdAt: saleAt,
						});
						stockMovementRows.push({
							id: randomUUID(),
							productId: product.id,
							deltaUnits: -qtyUnits,
							reason: credit ? "credit_sale" : "sale",
							refTable: "sale_lines",
							refId: lineId,
							actorId: salesClerkId,
							occurredAt: saleAt,
							createdAt: saleAt,
						});
					}

					if (linesForSale.length === 0) {
						continue;
					}
					saleLineRows.push(...linesForSale);
					saleRows.push({
						id: saleId,
						clerkId: salesClerkId,
						soldAt: saleAt,
						type: credit ? "credit" : "cash",
						total: centsToMoney(totalCents),
						totalProfit: centsToMoney(profitCents),
						createdAt: saleAt,
					});

					if (!credit) {
						continue;
					}

					// One credit sale in three is settled in full, one in three is
					// half paid and one in three is still outstanding.
					const invoiceId = randomUUID();
					const customerIndex = creditIndex % customerIds.length;
					const settlement = creditIndex % 3;
					creditIndex += 1;
					const plannedPaymentAt = new Date(
						saleAt.getTime() + randomInt(random, 1, 10) * DAY_MS,
					);
					const paymentAt =
						plannedPaymentAt <= now ? plannedPaymentAt : undefined;
					const paymentCents =
						paymentAt === undefined
							? 0
							: settlement === 0
								? totalCents
								: settlement === 1
									? Math.max(1, Math.floor(totalCents / 2))
									: 0;
					const balanceCents = totalCents - paymentCents;

					invoiceRows.push({
						id: invoiceId,
						saleId,
						customerId: customerIds[customerIndex] as string,
						total: centsToMoney(totalCents),
						balance: centsToMoney(balanceCents),
						issuedAt: saleAt,
						createdAt: saleAt,
					});
					if (paymentAt !== undefined && paymentCents > 0) {
						customerPaymentRows.push({
							id: randomUUID(),
							invoiceId,
							amount: centsToMoney(paymentCents),
							paidAt: paymentAt,
							recordedBy: accountantId,
							createdAt: paymentAt,
						});
					}
					customerOutstanding[customerIndex] =
						(customerOutstanding[customerIndex] ?? 0) + balanceCents;
				}
			}

			// ---- Write-offs ----------------------------------------------------
			// A handful of damaged-goods adjustments, taken from the fastest movers
			// that still finish the month with plenty of cover.
			const writeOffAt = dateAtDaysAgo(
				now,
				WRITE_OFF_DAYS_AGO,
				TRADING_OPEN_MINUTE + 45,
			);
			const writeOffCandidates = demoProducts
				.filter((product) => product.soldTotal >= 20)
				.slice(0, WRITE_OFF_COUNT);
			for (const product of writeOffCandidates) {
				product.writeOffUnits = randomInt(random, 2, 6);
			}

			// ---- Stock planning ------------------------------------------------
			// Two delivery rounds cover every unit that leaves the shelf plus the
			// closing balance, and the opening round alone covers everything sold
			// before the restock date, so the ledger never dips below zero.
			for (const product of demoProducts) {
				const consumed = product.soldTotal + product.writeOffUnits;
				const dailyRate = product.soldTotal / SALE_DAYS;
				// Fast movers in small bulk units are deliberately left thin so the
				// low-stock alert screen has something to report.
				const thin = product.popularity >= 4 && product.unitsPerBulk <= 8;
				const coverDays =
					product.soldTotal === 0
						? 0
						: thin
							? randomInt(random, 1, 4)
							: randomInt(random, 16, 50);
				const closingTarget =
					product.soldTotal === 0
						? randomInt(random, 10, 40)
						: Math.max(1, Math.round(dailyRate * coverDays));

				const neededBulk = Math.max(
					1,
					Math.ceil((consumed + closingTarget) / product.unitsPerBulk),
				);
				const minimumOpeningBulk = Math.max(
					1,
					Math.ceil(product.soldBeforeRestock / product.unitsPerBulk),
				);
				const openingBulk = Math.min(
					neededBulk,
					Math.max(minimumOpeningBulk, Math.round(neededBulk * 0.6)),
				);
				product.openingBulk = openingBulk;
				product.restockBulk = neededBulk - openingBulk;
			}

			for (const product of writeOffCandidates) {
				stockMovementRows.push({
					id: randomUUID(),
					productId: product.id,
					deltaUnits: -product.writeOffUnits,
					reason: "adjustment",
					refTable: "adjustments",
					refId: randomUUID(),
					actorId: inventoryClerkId,
					note: "Damaged in storage during the monthly count.",
					occurredAt: writeOffAt,
					createdAt: writeOffAt,
				});
			}

			// ---- Procurement ---------------------------------------------------
			const purchaseOrderRows: Array<typeof purchaseOrders.$inferInsert> = [];
			const poLineRows: Array<typeof poLines.$inferInsert> = [];
			const goodsReceiptRows: Array<typeof goodsReceipts.$inferInsert> = [];
			const receiptLineRows: Array<typeof receiptLines.$inferInsert> = [];
			const supplierPaymentRows: Array<typeof supplierPayments.$inferInsert> =
				[];
			const supplierOutstanding = supplierDefinitions.map(() => 0);

			const addReceivedRound = (
				daysAgo: number,
				bulkFor: (product: DemoProduct) => number,
			) => {
				for (const [supplierIndex, supplierId] of supplierIds.entries()) {
					const supplierProducts = demoProducts.filter(
						(product) =>
							product.supplierIndex === supplierIndex && bulkFor(product) > 0,
					);
					if (supplierProducts.length === 0) {
						continue;
					}

					const deliveryAt = dateAtDaysAgo(
						now,
						daysAgo,
						DELIVERY_MINUTE + supplierIndex * 3,
					);
					const poId = randomUUID();
					const receiptId = randomUUID();
					purchaseOrderRows.push({
						id: poId,
						supplierId,
						status: "received",
						createdBy: inventoryClerkId,
						createdAt: new Date(deliveryAt.getTime() - 2 * DAY_MS),
					});
					goodsReceiptRows.push({
						id: receiptId,
						poId,
						receivedBy: inventoryClerkId,
						signedOffAt: deliveryAt,
						createdAt: deliveryAt,
					});

					let receiptValueCents = 0;
					for (const product of supplierProducts) {
						const qtyBulk = bulkFor(product);
						const poLineId = randomUUID();
						poLineRows.push({
							id: poLineId,
							poId,
							productId: product.id,
							qtyBulk,
							bulkCostAtOrder: product.bulkCost,
							createdAt: deliveryAt,
						});
						receiptLineRows.push({
							id: randomUUID(),
							receiptId,
							poLineId,
							qtyBulkReceived: qtyBulk,
							createdAt: deliveryAt,
						});
						receiptValueCents += product.bulkCostCents * qtyBulk;
						stockMovementRows.push({
							id: randomUUID(),
							productId: product.id,
							deltaUnits: qtyBulk * product.unitsPerBulk,
							reason: "delivery",
							refTable: "goods_receipts",
							refId: receiptId,
							actorId: inventoryClerkId,
							occurredAt: deliveryAt,
							createdAt: deliveryAt,
						});
					}

					// Two suppliers in three are settled on the spot; the rest leave a
					// payable behind so the supplier balances are not all zero.
					const settledOnDelivery = (supplierIndex + daysAgo) % 3 !== 0;
					const paidCents = settledOnDelivery
						? receiptValueCents
						: Math.floor(receiptValueCents * 0.45);
					if (paidCents > 0) {
						supplierPaymentRows.push({
							id: randomUUID(),
							supplierId,
							poId,
							amount: centsToMoney(paidCents),
							paidAt: deliveryAt,
							recordedBy: accountantId,
							createdAt: deliveryAt,
						});
					}
					supplierOutstanding[supplierIndex] =
						(supplierOutstanding[supplierIndex] ?? 0) +
						receiptValueCents -
						paidCents;
				}
			};

			addReceivedRound(OPENING_DAYS_AGO, (product) => product.openingBulk);
			addReceivedRound(RESTOCK_DAYS_AGO, (product) => product.restockBulk);

			// A still-open order per supplier gives the receiving screen live work.
			for (const [supplierIndex, supplierId] of supplierIds.entries()) {
				const openAt = dateAtDaysAgo(
					now,
					OPEN_DAYS_AGO,
					DELIVERY_MINUTE + supplierIndex * 3,
				);
				const supplierProducts = demoProducts
					.filter((product) => product.supplierIndex === supplierIndex)
					.slice(0, 4);
				if (supplierProducts.length === 0) {
					continue;
				}
				const poId = randomUUID();
				purchaseOrderRows.push({
					id: poId,
					supplierId,
					status: "open",
					createdBy: inventoryClerkId,
					createdAt: openAt,
				});
				for (const product of supplierProducts) {
					poLineRows.push({
						id: randomUUID(),
						poId,
						productId: product.id,
						qtyBulk: randomInt(random, 2, 6),
						bulkCostAtOrder: product.bulkCost,
						createdAt: openAt,
					});
				}
			}

			// ---- Closing balances ----------------------------------------------
			const stockLevelRows: Array<typeof stockLevels.$inferInsert> =
				demoProducts.map((product) => {
					const received =
						(product.openingBulk + product.restockBulk) * product.unitsPerBulk;
					const qtyUnits = received - product.soldTotal - product.writeOffUnits;
					if (qtyUnits < 0) {
						throw new Error(
							`Demo stock planning failed for ${product.sku}: closing quantity ${qtyUnits}.`,
						);
					}
					return { productId: product.id, qtyUnits };
				});

			const supplierRows: Array<typeof suppliers.$inferInsert> =
				supplierDefinitions.map(([name, phone], index) => ({
					id: supplierIds[index],
					name,
					phone,
					note: "Demo data supplier",
					outstandingBalance: centsToMoney(supplierOutstanding[index] ?? 0),
					archived: false,
				}));
			const customerRows: Array<typeof customers.$inferInsert> =
				customerDefinitions.map(([name, phone], index) => ({
					id: customerIds[index],
					name,
					phone,
					outstandingBalance: centsToMoney(customerOutstanding[index] ?? 0),
				}));

			// ---- Expenses ------------------------------------------------------
			const expenseRows: Array<typeof expenses.$inferInsert> = [];
			for (const plan of expensePlan) {
				for (let index = 0; index < plan.count; index += 1) {
					const incurredAt = dateAtDaysAgo(
						now,
						randomInt(random, 0, SALE_DAYS - 1),
						12 * 60,
					);
					expenseRows.push({
						id: randomUUID(),
						category: plan.category,
						amount: centsToMoney(
							randomInt(random, plan.minCents, plan.maxCents),
						),
						incurredOn: dateOnly(incurredAt),
						note: plan.note,
						recordedBy: accountantId,
						createdAt: incurredAt,
					});
				}
			}

			// ---- Write ---------------------------------------------------------
			// Parents before children: categories and users exist, then products,
			// then everything that references a product.
			await insertInChunks(categoryRows, (rows) =>
				tx.insert(categories).values(rows),
			);
			await insertInChunks(productRows, (rows) =>
				tx.insert(products).values(rows),
			);
			await insertInChunks(supplierRows, (rows) =>
				tx.insert(suppliers).values(rows),
			);
			await insertInChunks(customerRows, (rows) =>
				tx.insert(customers).values(rows),
			);
			await insertInChunks(purchaseOrderRows, (rows) =>
				tx.insert(purchaseOrders).values(rows),
			);
			await insertInChunks(poLineRows, (rows) =>
				tx.insert(poLines).values(rows),
			);
			await insertInChunks(goodsReceiptRows, (rows) =>
				tx.insert(goodsReceipts).values(rows),
			);
			await insertInChunks(receiptLineRows, (rows) =>
				tx.insert(receiptLines).values(rows),
			);
			await insertInChunks(supplierPaymentRows, (rows) =>
				tx.insert(supplierPayments).values(rows),
			);
			await insertInChunks(saleRows, (rows) => tx.insert(sales).values(rows));
			await insertInChunks(saleLineRows, (rows) =>
				tx.insert(saleLines).values(rows),
			);
			await insertInChunks(invoiceRows, (rows) =>
				tx.insert(invoices).values(rows),
			);
			await insertInChunks(customerPaymentRows, (rows) =>
				tx.insert(customerPayments).values(rows),
			);
			await insertInChunks(expenseRows, (rows) =>
				tx.insert(expenses).values(rows),
			);
			await insertInChunks(stockMovementRows, (rows) =>
				tx.insert(stockMovements).values(rows),
			);
			await insertInChunks(stockLevelRows, (rows) =>
				tx.insert(stockLevels).values(rows),
			);

			return {
				categories: categoryRows.length,
				products: productRows.length,
				suppliers: supplierRows.length,
				purchaseOrders: purchaseOrderRows.length,
				goodsReceipts: goodsReceiptRows.length,
				customers: customerRows.length,
				daysWithSales,
				sales: saleRows.length,
				saleLines: saleLineRows.length,
				invoices: invoiceRows.length,
				customerPayments: customerPaymentRows.length,
				expenses: expenseRows.length,
				stockMovements: stockMovementRows.length,
			};
		});

		console.log(
			[
				`${summary.categories} categories`,
				`${summary.products} products`,
				`${summary.suppliers} suppliers`,
				`${summary.purchaseOrders} purchase orders`,
				`${summary.goodsReceipts} goods receipts`,
				`${summary.customers} customers`,
				`${summary.sales} sales over ${summary.daysWithSales} days`,
				`${summary.saleLines} sale lines`,
				`${summary.invoices} invoices`,
				`${summary.customerPayments} customer payments`,
				`${summary.expenses} expenses`,
				`${summary.stockMovements} stock movements`,
			].join("\n  "),
		);
		console.log("ShelfLife demo data created successfully.");
	} finally {
		await queryClient.end();
	}
}

await generateDemoData();
