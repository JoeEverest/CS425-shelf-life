import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	date,
	integer,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("role", [
	"admin",
	"manager",
	"sales_clerk",
	"inventory_clerk",
	"accountant",
]);

export const stockMovementReasonEnum = pgEnum("stock_movement_reason", [
	"sale",
	"credit_sale",
	"delivery",
	"adjustment",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
	"open",
	"partially_received",
	"received",
]);

export const saleTypeEnum = pgEnum("sale_type", ["cash", "credit"]);

export const expenseCategoryEnum = pgEnum("expense_category", [
	"rent",
	"transport",
	"delivery",
	"salaries",
	"utilities",
]);

export const stores = pgTable("stores", {
	id: id(),
	name: text("name").notNull(),
	currency: char("currency", { length: 3 }).notNull(),
	address: text("address").notNull(),
	velocityWindowDays: integer("velocity_window_days").default(30).notNull(),
	lowStockCoverDays: integer("low_stock_cover_days").default(7).notNull(),
	createdAt: createdAt(),
});

export const users = pgTable("users", {
	id: id(),
	name: text("name").notNull(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	active: boolean("active").default(true).notNull(),
	createdAt: createdAt(),
});

export const userRoles = pgTable(
	"user_roles",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id),
		role: roleEnum("role").notNull(),
		createdAt: createdAt(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const categories = pgTable("categories", {
	id: id(),
	name: text("name").notNull().unique(),
	createdAt: createdAt(),
});

export const products = pgTable(
	"products",
	{
		id: id(),
		sku: text("sku").notNull().unique(),
		name: text("name").notNull(),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => categories.id),
		bulkUnitName: text("bulk_unit_name").notNull(),
		unitsPerBulk: integer("units_per_bulk").notNull(),
		saleUnitName: text("sale_unit_name").notNull(),
		bulkCost: numeric("bulk_cost", { precision: 12, scale: 2 }).notNull(),
		price: numeric("price", { precision: 12, scale: 2 }),
		published: boolean("published").default(false).notNull(),
		archived: boolean("archived").default(false).notNull(),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("products_units_per_bulk_positive", sql`${table.unitsPerBulk} > 0`),
	],
);

export const priceChanges = pgTable("price_changes", {
	id: id(),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id),
	oldPrice: numeric("old_price", { precision: 12, scale: 2 }),
	newPrice: numeric("new_price", { precision: 12, scale: 2 }).notNull(),
	changedBy: uuid("changed_by")
		.notNull()
		.references(() => users.id),
	createdAt: createdAt(),
});

export const stockLevels = pgTable(
	"stock_levels",
	{
		productId: uuid("product_id")
			.primaryKey()
			.references(() => products.id),
		qtyUnits: integer("qty_units").default(0).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("stock_levels_qty_units_nonnegative", sql`${table.qtyUnits} >= 0`),
	],
);

export const stockMovements = pgTable("stock_movements", {
	id: id(),
	productId: uuid("product_id")
		.notNull()
		.references(() => products.id),
	deltaUnits: integer("delta_units").notNull(),
	reason: stockMovementReasonEnum("reason").notNull(),
	refTable: text("ref_table").notNull(),
	refId: uuid("ref_id").notNull(),
	actorId: uuid("actor_id")
		.notNull()
		.references(() => users.id),
	note: text("note"),
	occurredAt: timestamp("occurred_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	createdAt: createdAt(),
});

export const suppliers = pgTable("suppliers", {
	id: id(),
	name: text("name").notNull(),
	phone: text("phone"),
	note: text("note"),
	outstandingBalance: numeric("outstanding_balance", {
		precision: 12,
		scale: 2,
	})
		.default("0")
		.notNull(),
	archived: boolean("archived").default(false).notNull(),
	createdAt: createdAt(),
});

export const purchaseOrders = pgTable("purchase_orders", {
	id: id(),
	supplierId: uuid("supplier_id")
		.notNull()
		.references(() => suppliers.id),
	status: purchaseOrderStatusEnum("status").default("open").notNull(),
	createdBy: uuid("created_by")
		.notNull()
		.references(() => users.id),
	createdAt: createdAt(),
});

export const poLines = pgTable(
	"po_lines",
	{
		id: id(),
		poId: uuid("po_id")
			.notNull()
			.references(() => purchaseOrders.id),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id),
		qtyBulk: integer("qty_bulk").notNull(),
		bulkCostAtOrder: numeric("bulk_cost_at_order", {
			precision: 12,
			scale: 2,
		}).notNull(),
		createdAt: createdAt(),
	},
	(table) => [check("po_lines_qty_bulk_positive", sql`${table.qtyBulk} > 0`)],
);

export const goodsReceipts = pgTable("goods_receipts", {
	id: id(),
	poId: uuid("po_id")
		.notNull()
		.references(() => purchaseOrders.id),
	receivedBy: uuid("received_by")
		.notNull()
		.references(() => users.id),
	signedOffAt: timestamp("signed_off_at", { withTimezone: true }).notNull(),
	discrepancyNote: text("discrepancy_note"),
	discrepancyConfirmedBy: uuid("discrepancy_confirmed_by").references(
		() => users.id,
	),
	createdAt: createdAt(),
});

export const receiptLines = pgTable(
	"receipt_lines",
	{
		id: id(),
		receiptId: uuid("receipt_id")
			.notNull()
			.references(() => goodsReceipts.id),
		poLineId: uuid("po_line_id")
			.notNull()
			.references(() => poLines.id),
		qtyBulkReceived: integer("qty_bulk_received").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"receipt_lines_qty_bulk_received_nonnegative",
			sql`${table.qtyBulkReceived} >= 0`,
		),
	],
);

export const supplierPayments = pgTable(
	"supplier_payments",
	{
		id: id(),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id),
		poId: uuid("po_id").references(() => purchaseOrders.id),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("supplier_payments_amount_positive", sql`${table.amount} > 0`),
	],
);

export const customers = pgTable("customers", {
	id: id(),
	name: text("name").notNull(),
	phone: text("phone"),
	outstandingBalance: numeric("outstanding_balance", {
		precision: 12,
		scale: 2,
	})
		.default("0")
		.notNull(),
	createdAt: createdAt(),
});

export const sales = pgTable("sales", {
	id: id(),
	clerkId: uuid("clerk_id")
		.notNull()
		.references(() => users.id),
	soldAt: timestamp("sold_at", { withTimezone: true }).defaultNow().notNull(),
	type: saleTypeEnum("type").notNull(),
	total: numeric("total", { precision: 12, scale: 2 }).notNull(),
	totalProfit: numeric("total_profit", { precision: 12, scale: 2 }).notNull(),
	createdAt: createdAt(),
});

export const saleLines = pgTable(
	"sale_lines",
	{
		id: id(),
		saleId: uuid("sale_id")
			.notNull()
			.references(() => sales.id),
		productId: uuid("product_id")
			.notNull()
			.references(() => products.id),
		qtyUnits: integer("qty_units").notNull(),
		unitPriceAtSale: numeric("unit_price_at_sale", {
			precision: 12,
			scale: 2,
		}).notNull(),
		unitCostAtSale: numeric("unit_cost_at_sale", {
			precision: 12,
			scale: 4,
		}).notNull(),
		lineCogs: numeric("line_cogs", { precision: 12, scale: 2 }).notNull(),
		lineProfit: numeric("line_profit", {
			precision: 12,
			scale: 2,
		}).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("sale_lines_qty_units_positive", sql`${table.qtyUnits} > 0`),
	],
);

export const invoices = pgTable(
	"invoices",
	{
		id: id(),
		saleId: uuid("sale_id")
			.notNull()
			.unique()
			.references(() => sales.id),
		customerId: uuid("customer_id")
			.notNull()
			.references(() => customers.id),
		total: numeric("total", { precision: 12, scale: 2 }).notNull(),
		balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
		issuedAt: timestamp("issued_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check("invoices_balance_nonnegative", sql`${table.balance} >= 0`),
	],
);

export const customerPayments = pgTable(
	"customer_payments",
	{
		id: id(),
		invoiceId: uuid("invoice_id")
			.notNull()
			.references(() => invoices.id),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [
		check("customer_payments_amount_positive", sql`${table.amount} > 0`),
	],
);

export const expenses = pgTable(
	"expenses",
	{
		id: id(),
		category: expenseCategoryEnum("category").notNull(),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		incurredOn: date("incurred_on").notNull(),
		note: text("note"),
		recordedBy: uuid("recorded_by")
			.notNull()
			.references(() => users.id),
		createdAt: createdAt(),
	},
	(table) => [check("expenses_amount_positive", sql`${table.amount} > 0`)],
);

export const sessions = pgTable("sessions", {
	id: id(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	tokenHash: text("token_hash").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: createdAt(),
});
