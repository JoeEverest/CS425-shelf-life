import type { Role } from "shared";

export type Me = {
	id: string;
	name: string;
	username: string;
	roles: Role[];
};

export type Employee = {
	id: string;
	name: string;
	username: string;
	active: boolean;
	roles: Role[];
};

export type Store = {
	id: string;
	name: string;
	currency: string;
	address: string;
	velocityWindowDays: number;
	lowStockCoverDays: number;
};

export type Category = {
	id: string;
	name: string;
};

export type Product = {
	id: string;
	sku: string;
	name: string;
	categoryId: string;
	categoryName: string;
	bulkUnitName: string;
	unitsPerBulk: number;
	saleUnitName: string;
	bulkCost: string;
	price: string | null;
	published: boolean;
	archived: boolean;
	qtyUnits: number;
};

export type PriceChange = {
	id: string;
	oldPrice: string | null;
	newPrice: string;
	changedBy: string;
	createdAt: string;
};

export type StockRow = {
	productId: string;
	sku: string;
	name: string;
	bulkUnitName: string;
	unitsPerBulk: number;
	saleUnitName: string;
	qtyUnits: number;
	archived: boolean;
};

export type Supplier = {
	id: string;
	name: string;
	phone: string | null;
	note: string | null;
	outstandingBalance: string;
	archived: boolean;
};

export type PurchaseOrderSummary = {
	id: string;
	supplierId: string;
	supplierName: string;
	status: "open" | "partially_received" | "received";
	lineCount: number;
	totalValue: string;
	createdAt: string;
};

export type PurchaseOrderDetail = {
	id: string;
	supplierId: string;
	supplierName: string;
	status: "open" | "partially_received" | "received";
	createdAt: string;
	lines: Array<{
		id: string;
		productId: string;
		productName: string;
		sku: string;
		bulkUnitName: string;
		qtyBulk: number;
		bulkCostAtOrder: string;
	}>;
};

export type Expense = {
	id: string;
	category: "rent" | "transport" | "delivery" | "salaries" | "utilities";
	amount: string;
	incurredOn: string;
	note: string | null;
};

export type FinancialReport = {
	revenue: string;
	cogs: string;
	grossProfit: string;
	expensesTotal: string;
	expensesByCategory: Record<string, string>;
	netProfit: string;
};
