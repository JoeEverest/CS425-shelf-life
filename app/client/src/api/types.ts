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
		receivedSoFar?: number;
		remaining?: number;
	}>;
};

export type SaleSummary = {
	id: string;
	soldAt: string;
	type: "cash" | "credit";
	total: string;
	totalProfit: string;
	lineCount: number;
};

export type SaleDetail = {
	id: string;
	soldAt: string;
	type: "cash" | "credit";
	total: string;
	totalProfit: string;
	lines: Array<{
		id: string;
		productId: string;
		productName: string;
		sku: string;
		qtyUnits: number;
		saleUnitName?: string;
		unitPriceAtSale: string;
		lineProfit: string;
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

export type StockAlert = {
	productId: string;
	sku: string;
	name: string;
	qtyUnits: number;
	saleUnitName: string;
	velocityPerDay: string;
	daysToStockout: string | null;
	low: boolean;
	hasHistory: boolean;
};

export type Customer = {
	id: string;
	name: string;
	phone: string | null;
	outstandingBalance: string;
};

export type Invoice = {
	id: string;
	customerId: string;
	customerName: string;
	total: string;
	balance: string;
	issuedAt: string;
	saleId: string;
};

export type InvoiceDetail = Invoice & {
	payments: Array<{
		id: string;
		amount: string;
		paidAt: string;
	}>;
};

export type Dashboard = {
	salesTotal: string;
	salesProfit: string;
	salesCount: number;
	expensesTotal: string;
	netProfit: string;
	supplierPayable: string;
	customerReceivable: string;
	lowStockCount: number;
	topProducts: Array<{
		productId: string;
		name: string;
		sku: string;
		unitsSold: number;
		revenue: string;
		profit: string;
	}>;
};
