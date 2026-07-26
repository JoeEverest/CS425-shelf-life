import {
	type UseMutationOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { type ApiError, api } from "./client";
import type {
	Category,
	Customer,
	Dashboard,
	Employee,
	Expense,
	FinancialReport,
	Invoice,
	InvoiceDetail,
	Me,
	PriceChange,
	Product,
	PurchaseOrderDetail,
	PurchaseOrderSummary,
	SaleDetail,
	SaleSummary,
	StockAlert,
	StockRow,
	Store,
	Supplier,
} from "./types";

// ---- auth & setup -----------------------------------------------------------

export function useMe() {
	return useQuery<Me, ApiError>({
		queryKey: ["auth", "me"],
		queryFn: () => api.get<Me>("/api/auth/me"),
		retry: (count, error) => error.status !== 401 && count < 2,
		staleTime: 60_000,
	});
}

export function useSetupStatus() {
	return useQuery<{ needed: boolean }, ApiError>({
		queryKey: ["setup", "status"],
		queryFn: () => api.get<{ needed: boolean }>("/api/setup/status"),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useLogin() {
	const queryClient = useQueryClient();
	return useMutation<Me, ApiError, { username: string; password: string }>({
		mutationFn: (body) => api.post<Me>("/api/auth/login", body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth"] }),
	});
}

export function useLogout() {
	const queryClient = useQueryClient();
	return useMutation<void, ApiError, void>({
		mutationFn: () => api.post<void>("/api/auth/logout"),
		onSuccess: () => queryClient.clear(),
	});
}

export function useRunSetup() {
	const queryClient = useQueryClient();
	return useMutation<
		Me,
		ApiError,
		{
			storeName: string;
			currency: string;
			address: string;
			admin: { name: string; username: string; password: string };
		}
	>({
		mutationFn: (body) => api.post<Me>("/api/setup", body),
		onSuccess: () => queryClient.invalidateQueries(),
	});
}

// ---- shared mutation helper -------------------------------------------------

function invalidating<TData, TVariables>(
	keys: string[][],
	mutationFn: (variables: TVariables) => Promise<TData>,
): (
	queryClient: ReturnType<typeof useQueryClient>,
) => UseMutationOptions<TData, ApiError, TVariables> {
	return (queryClient) => ({
		mutationFn,
		onSuccess: () => {
			for (const key of keys) {
				queryClient.invalidateQueries({ queryKey: key });
			}
		},
	});
}

function useInvalidatingMutation<TData, TVariables>(
	keys: string[][],
	mutationFn: (variables: TVariables) => Promise<TData>,
) {
	const queryClient = useQueryClient();
	return useMutation<TData, ApiError, TVariables>(
		invalidating<TData, TVariables>(keys, mutationFn)(queryClient),
	);
}

// ---- store ------------------------------------------------------------------

export function useStore() {
	return useQuery<Store, ApiError>({
		queryKey: ["store"],
		queryFn: () => api.get<Store>("/api/store"),
		staleTime: 300_000,
	});
}

export function useUpdateStore() {
	return useInvalidatingMutation(
		[["store"]],
		(
			body: Partial<
				Pick<
					Store,
					"name" | "address" | "velocityWindowDays" | "lowStockCoverDays"
				>
			>,
		) => api.patch<Store>("/api/store", body),
	);
}

// ---- employees --------------------------------------------------------------

export function useEmployees() {
	return useQuery<Employee[], ApiError>({
		queryKey: ["employees"],
		queryFn: () => api.get<Employee[]>("/api/users"),
	});
}

export function useCreateEmployee() {
	return useInvalidatingMutation(
		[["employees"]],
		(body: {
			name: string;
			username: string;
			password: string;
			roles: string[];
		}) => api.post<Employee>("/api/users", body),
	);
}

export function useUpdateEmployee() {
	return useInvalidatingMutation(
		[["employees"]],
		({ id, ...body }: { id: string; name?: string; roles?: string[] }) =>
			api.patch<Employee>(`/api/users/${id}`, body),
	);
}

export function useSetEmployeeActive() {
	return useInvalidatingMutation(
		[["employees"]],
		({ id, active }: { id: string; active: boolean }) =>
			api.post<Employee>(
				`/api/users/${id}/${active ? "reactivate" : "deactivate"}`,
			),
	);
}

// ---- catalog ----------------------------------------------------------------

export function useCategories() {
	return useQuery<Category[], ApiError>({
		queryKey: ["categories"],
		queryFn: () => api.get<Category[]>("/api/categories"),
	});
}

export function useCreateCategory() {
	return useInvalidatingMutation([["categories"]], (body: { name: string }) =>
		api.post<Category>("/api/categories", body),
	);
}

export function useProducts(includeArchived = false) {
	return useQuery<Product[], ApiError>({
		queryKey: ["products", { includeArchived }],
		queryFn: () =>
			api.get<Product[]>(`/api/products?archived=${includeArchived}`),
	});
}

export function useCreateProduct() {
	return useInvalidatingMutation(
		[["products"], ["stock"]],
		(body: {
			sku: string;
			name: string;
			categoryId: string;
			bulkUnitName: string;
			unitsPerBulk: number;
			saleUnitName: string;
			bulkCost: string;
		}) => api.post<Product>("/api/products", body),
	);
}

export function usePublishProduct() {
	return useInvalidatingMutation([["products"]], (id: string) =>
		api.post<Product>(`/api/products/${id}/publish`),
	);
}

export function useArchiveProduct() {
	return useInvalidatingMutation([["products"], ["stock"]], (id: string) =>
		api.post<Product>(`/api/products/${id}/archive`),
	);
}

export function useSetPrice() {
	return useInvalidatingMutation(
		[["products"], ["price-history"]],
		({ id, price }: { id: string; price: string }) =>
			api.patch<Product>(`/api/products/${id}/price`, { price }),
	);
}

export function usePriceHistory(productId: string | null) {
	return useQuery<PriceChange[], ApiError>({
		queryKey: ["price-history", productId],
		queryFn: () =>
			api.get<PriceChange[]>(`/api/products/${productId}/price-history`),
		enabled: productId !== null,
	});
}

// ---- stock ------------------------------------------------------------------

export function useStock() {
	return useQuery<StockRow[], ApiError>({
		queryKey: ["stock"],
		queryFn: () => api.get<StockRow[]>("/api/stock"),
	});
}

export function useAdjustStock() {
	return useInvalidatingMutation(
		[["stock"], ["products"]],
		(body: { productId: string; deltaUnits: number; note: string }) =>
			api.post("/api/stock/adjustments", body),
	);
}

// ---- suppliers & purchase orders -------------------------------------------

export function useSuppliers(includeArchived = false) {
	return useQuery<Supplier[], ApiError>({
		queryKey: ["suppliers", { includeArchived }],
		queryFn: () =>
			api.get<Supplier[]>(`/api/suppliers?archived=${includeArchived}`),
	});
}

export function useCreateSupplier() {
	return useInvalidatingMutation(
		[["suppliers"]],
		(body: { name: string; phone?: string; note?: string }) =>
			api.post<Supplier>("/api/suppliers", body),
	);
}

export function useUpdateSupplier() {
	return useInvalidatingMutation(
		[["suppliers"]],
		({
			id,
			...body
		}: {
			id: string;
			name?: string;
			phone?: string;
			note?: string;
		}) => api.patch<Supplier>(`/api/suppliers/${id}`, body),
	);
}

export function useArchiveSupplier() {
	return useInvalidatingMutation([["suppliers"]], (id: string) =>
		api.post<Supplier>(`/api/suppliers/${id}/archive`),
	);
}

export function usePurchaseOrders() {
	return useQuery<PurchaseOrderSummary[], ApiError>({
		queryKey: ["purchase-orders"],
		queryFn: () => api.get<PurchaseOrderSummary[]>("/api/purchase-orders"),
	});
}

export function usePurchaseOrder(id: string | null) {
	return useQuery<PurchaseOrderDetail, ApiError>({
		queryKey: ["purchase-orders", id],
		queryFn: () => api.get<PurchaseOrderDetail>(`/api/purchase-orders/${id}`),
		enabled: id !== null,
	});
}

export function useCreatePurchaseOrder() {
	return useInvalidatingMutation(
		[["purchase-orders"]],
		(body: {
			supplierId: string;
			lines: Array<{ productId: string; qtyBulk: number }>;
		}) => api.post<PurchaseOrderDetail>("/api/purchase-orders", body),
	);
}

export type ReceiptPayment =
	| { kind: "immediate" }
	| { kind: "deferred" }
	| { kind: "partial"; amount: string };

export function useReceiveDelivery() {
	return useInvalidatingMutation(
		[["purchase-orders"], ["stock"], ["suppliers"], ["products"]],
		({
			poId,
			...body
		}: {
			poId: string;
			lines: Array<{ poLineId: string; qtyBulkReceived: number }>;
			payment: ReceiptPayment;
			discrepancyNote?: string;
			discrepancyConfirmed?: boolean;
		}) => api.post(`/api/purchase-orders/${poId}/receipts`, body),
	);
}

// ---- sales (POS) ------------------------------------------------------------

export function useSales() {
	return useQuery<SaleSummary[], ApiError>({
		queryKey: ["sales"],
		queryFn: () => api.get<SaleSummary[]>("/api/sales"),
	});
}

export function useSale(id: string | null) {
	return useQuery<SaleDetail, ApiError>({
		queryKey: ["sales", id],
		queryFn: () => api.get<SaleDetail>(`/api/sales/${id}`),
		enabled: id !== null,
	});
}

export function useRecordSale() {
	return useInvalidatingMutation(
		[["sales"], ["stock"], ["products"], ["invoices"], ["customers"]],
		(
			body:
				| {
						type: "cash";
						lines: Array<{ productId: string; qtyUnits: number }>;
				  }
				| {
						type: "credit";
						customerId: string;
						lines: Array<{ productId: string; qtyUnits: number }>;
				  },
		) => api.post<SaleDetail>("/api/sales", body),
	);
}

// ---- low-stock alerts -------------------------------------------------------

export function useStockAlerts() {
	return useQuery<StockAlert[], ApiError>({
		queryKey: ["stock", "alerts"],
		queryFn: () => api.get<StockAlert[]>("/api/stock/alerts"),
	});
}

// ---- customers, invoices, payments ------------------------------------------

export function useCustomers() {
	return useQuery<Customer[], ApiError>({
		queryKey: ["customers"],
		queryFn: () => api.get<Customer[]>("/api/customers"),
	});
}

export function useCreateCustomer() {
	return useInvalidatingMutation(
		[["customers"]],
		(body: { name: string; phone?: string }) =>
			api.post<Customer>("/api/customers", body),
	);
}

export function useInvoices() {
	return useQuery<Invoice[], ApiError>({
		queryKey: ["invoices"],
		queryFn: () => api.get<Invoice[]>("/api/invoices"),
	});
}

export function useInvoice(id: string | null) {
	return useQuery<InvoiceDetail, ApiError>({
		queryKey: ["invoices", id],
		queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${id}`),
		enabled: id !== null,
	});
}

export function useRecordPayment() {
	return useInvalidatingMutation(
		[["invoices"], ["customers"]],
		({ invoiceId, amount }: { invoiceId: string; amount: string }) =>
			api.post(`/api/invoices/${invoiceId}/payments`, { amount }),
	);
}

// ---- analytics dashboard ----------------------------------------------------

export function useDashboard() {
	return useQuery<Dashboard, ApiError>({
		queryKey: ["dashboard"],
		queryFn: () => api.get<Dashboard>("/api/analytics/dashboard"),
	});
}

// ---- expenses & reports -----------------------------------------------------

export function useExpenses() {
	return useQuery<Expense[], ApiError>({
		queryKey: ["expenses"],
		queryFn: () => api.get<Expense[]>("/api/expenses"),
	});
}

export function useCreateExpense() {
	return useInvalidatingMutation(
		[["expenses"], ["report"]],
		(body: {
			category: string;
			amount: string;
			incurredOn: string;
			note?: string;
		}) => api.post<Expense>("/api/expenses", body),
	);
}

export function useDeleteExpense() {
	return useInvalidatingMutation([["expenses"], ["report"]], (id: string) =>
		api.delete(`/api/expenses/${id}`),
	);
}

export function useFinancialReport(from: string, to: string) {
	return useQuery<FinancialReport, ApiError>({
		queryKey: ["report", { from, to }],
		queryFn: () =>
			api.get<FinancialReport>(`/api/reports/financial?from=${from}&to=${to}`),
		enabled: from !== "" && to !== "",
	});
}
