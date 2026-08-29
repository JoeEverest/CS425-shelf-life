// Barrel file: every table lives in ./tables/<table-name>.ts and is re-exported
// here, so `db/schema` stays the single import path for the rest of the app.

export * from "./tables/categories";
export * from "./tables/customer-payments";
export * from "./tables/customers";
export * from "./tables/expenses";
export * from "./tables/goods-receipts";
export * from "./tables/invoices";
export * from "./tables/po-lines";
export * from "./tables/price-changes";
export * from "./tables/products";
export * from "./tables/purchase-orders";
export * from "./tables/receipt-lines";
export * from "./tables/sale-lines";
export * from "./tables/sales";
export * from "./tables/sessions";
export * from "./tables/stock-levels";
export * from "./tables/stock-movements";
export * from "./tables/stores";
export * from "./tables/supplier-payments";
export * from "./tables/suppliers";
export * from "./tables/user-roles";
export * from "./tables/users";
