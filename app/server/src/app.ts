import type { Database } from "db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ApiResponse } from "shared";
import type { AppEnv } from "./auth-context";
import { AdministrationRepo } from "./repos/administration-repo";
import { CatalogRepo } from "./repos/catalog-repo";
import { FinanceRepo } from "./repos/finance-repo";
import { IdentityRepo } from "./repos/identity-repo";
import { InventoryRepo } from "./repos/inventory-repo";
import { PricingRepo } from "./repos/pricing-repo";
import { ProcurementRepo } from "./repos/procurement-repo";
import { SalesRepo } from "./repos/sales-repo";
import { SetupRepo } from "./repos/setup-repo";
import { createStoreRoutes, createUserRoutes } from "./routes/administration";
import { createAuthRoutes } from "./routes/auth";
import { createCategoryRoutes, createProductRoutes } from "./routes/catalog";
import { createExpenseRoutes, createReportRoutes } from "./routes/finance";
import { createInventoryRoutes } from "./routes/inventory";
import { createPricingRoutes } from "./routes/pricing";
import {
	createPurchaseOrderRoutes,
	createSupplierRoutes,
} from "./routes/procurement";
import { createSalesRoutes } from "./routes/sales";
import { createSetupRoutes } from "./routes/setup";
import { AdministrationService } from "./services/administration-service";
import { AuthService } from "./services/auth-service";
import { CatalogService } from "./services/catalog-service";
import { DomainError } from "./services/domain-error";
import { FinanceService } from "./services/finance-service";
import { InventoryService } from "./services/inventory-service";
import { PricingService } from "./services/pricing-service";
import { ProcurementService } from "./services/procurement-service";
import { SalesService } from "./services/sales-service";
import { SetupService } from "./services/setup-service";

export function createApp(database: Database): Hono<AppEnv> {
	const authService = new AuthService(new IdentityRepo(database));
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
	const salesService = new SalesService(new SalesRepo(database));
	const setupService = new SetupService(new SetupRepo(database));

	return new Hono<AppEnv>()
		.use(
			"*",
			cors({
				origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
				credentials: true,
			}),
		)
		.get("/hello", (context) => {
			const response: ApiResponse = {
				message: "Hello BHVR!",
				success: true,
			};
			return context.json(response);
		})
		.get("/api/health", (context) => {
			return context.json({ status: "ok" });
		})
		.route("/api/auth", createAuthRoutes(authService))
		.route("/api/setup", createSetupRoutes(setupService))
		.route("/api/users", createUserRoutes(authService, administrationService))
		.route("/api/store", createStoreRoutes(authService, administrationService))
		.route("/api/categories", createCategoryRoutes(authService, catalogService))
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
		.route("/api/expenses", createExpenseRoutes(authService, financeService))
		.route("/api/reports", createReportRoutes(authService, financeService))
		.notFound((context) => {
			return context.json(
				{ code: "NOT_FOUND", message: "The requested resource was not found." },
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
		});
}
