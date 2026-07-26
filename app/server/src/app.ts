import type { Database } from "db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./auth-context";
import { requestLogger } from "./middleware/request-logger";
import { AdministrationRepo } from "./repos/administration-repo";
import { AnalyticsRepo } from "./repos/analytics-repo";
import { CatalogRepo } from "./repos/catalog-repo";
import { FinanceRepo } from "./repos/finance-repo";
import { IdentityRepo } from "./repos/identity-repo";
import { InventoryRepo } from "./repos/inventory-repo";
import { PricingRepo } from "./repos/pricing-repo";
import { ProcurementRepo } from "./repos/procurement-repo";
import { ReceivablesRepo } from "./repos/receivables-repo";
import { SalesRepo } from "./repos/sales-repo";
import { SetupRepo } from "./repos/setup-repo";
import { createStoreRoutes, createUserRoutes } from "./routes/administration";
import { createAnalyticsRoutes } from "./routes/analytics";
import { createAuthRoutes } from "./routes/auth";
import { createCategoryRoutes, createProductRoutes } from "./routes/catalog";
import { createExpenseRoutes, createReportRoutes } from "./routes/finance";
import { createInventoryRoutes } from "./routes/inventory";
import { createPricingRoutes } from "./routes/pricing";
import {
	createPurchaseOrderRoutes,
	createSupplierRoutes,
} from "./routes/procurement";
import {
	createCustomerRoutes,
	createInvoiceRoutes,
} from "./routes/receivables";
import { createSalesRoutes } from "./routes/sales";
import { createSetupRoutes } from "./routes/setup";
import { AdministrationService } from "./services/administration-service";
import { AnalyticsService } from "./services/analytics-service";
import { AuthService } from "./services/auth-service";
import { CatalogService } from "./services/catalog-service";
import { DomainError } from "./services/domain-error";
import { FinanceService } from "./services/finance-service";
import { InventoryService } from "./services/inventory-service";
import { PricingService } from "./services/pricing-service";
import { ProcurementService } from "./services/procurement-service";
import { ReceivablesService } from "./services/receivables-service";
import { SalesService } from "./services/sales-service";
import { SetupService } from "./services/setup-service";

export function createApp(database: Database): Hono<AppEnv> {
	const authService = new AuthService(new IdentityRepo(database));
	const analyticsService = new AnalyticsService(new AnalyticsRepo(database));
	const administrationService = new AdministrationService(
		new AdministrationRepo(database),
	);
	const catalogRepo = new CatalogRepo(database);
	const catalogService = new CatalogService(catalogRepo);
	const financeService = new FinanceService(new FinanceRepo(database));
	const inventoryService = new InventoryService(new InventoryRepo(database));
	const pricingService = new PricingService(
		new PricingRepo(database),
		catalogRepo,
	);
	const procurementService = new ProcurementService(
		new ProcurementRepo(database),
	);
	const receivablesService = new ReceivablesService(
		new ReceivablesRepo(database),
	);
	const salesService = new SalesService(new SalesRepo(database));
	const setupService = new SetupService(new SetupRepo(database));

	return (
		new Hono<AppEnv>()
			.use("*", requestLogger())
			.use(
				"*",
				cors({
					origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
					credentials: true,
				}),
			)
			// Liveness: the process is up. Cheap, no dependencies.
			.get("/api/health", (context) => {
				return context.json({ status: "ok" });
			})
			// Readiness: the process can actually serve — verifies the database is
			// reachable. Returns 503 when it is not, so a load balancer / PM2 can
			// tell "up" from "able to serve".
			.get("/api/health/readiness", async (context) => {
				try {
					await database.execute(sql`select 1`);
					return context.json({ status: "ready", database: "ok" });
				} catch {
					return context.json(
						{ status: "unready", database: "unreachable" },
						503,
					);
				}
			})
			.route("/api/auth", createAuthRoutes(authService))
			.route("/api/setup", createSetupRoutes(setupService))
			.route("/api/users", createUserRoutes(authService, administrationService))
			.route(
				"/api/store",
				createStoreRoutes(authService, administrationService),
			)
			.route(
				"/api/categories",
				createCategoryRoutes(authService, catalogService),
			)
			.route("/api/products", createProductRoutes(authService, catalogService))
			.route("/api/products", createPricingRoutes(authService, pricingService))
			.route("/api/stock", createInventoryRoutes(authService, inventoryService))
			.route(
				"/api/suppliers",
				createSupplierRoutes(authService, procurementService),
			)
			.route(
				"/api/purchase-orders",
				createPurchaseOrderRoutes(authService, procurementService),
			)
			.route("/api/sales", createSalesRoutes(authService, salesService))
			.route(
				"/api/customers",
				createCustomerRoutes(authService, receivablesService),
			)
			.route(
				"/api/invoices",
				createInvoiceRoutes(authService, receivablesService),
			)
			.route("/api/expenses", createExpenseRoutes(authService, financeService))
			.route("/api/reports", createReportRoutes(authService, financeService))
			.route(
				"/api/analytics",
				createAnalyticsRoutes(authService, analyticsService),
			)
			.notFound((context) => {
				return context.json(
					{
						code: "NOT_FOUND",
						message: "The requested resource was not found.",
					},
					404,
				);
			})
			.onError((error, context) => {
				if (error instanceof DomainError) {
					return context.json(
						{ code: error.code, message: error.message },
						error.status,
					);
				}

				if (error instanceof HTTPException && error.status === 400) {
					return context.json(
						{
							code: "VALIDATION",
							message: error.message,
							issues: [],
						},
						400,
					);
				}

				console.error(error);
				return context.json(
					{ code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
					500,
				);
			})
	);
}
