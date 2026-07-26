import { Hono } from "hono";
import {
	archivedFilterSchema,
	categoryCreateSchema,
	categoryUpdateSchema,
	PERMISSIONS,
	productCreateSchema,
	productUpdateSchema,
	resourceIdParamsSchema,
} from "shared";
import type { AppEnv } from "../auth-context";
import { auth } from "../middleware/auth";
import { rbac, rbacAny } from "../middleware/rbac";
import { zodJson, zodParams, zodQuery } from "../middleware/validate";
import type { AuthService } from "../services/auth-service";
import type { CatalogService } from "../services/catalog-service";

export function createCategoryRoutes(
	authService: AuthService,
	catalogService: CatalogService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.STOCK_VIEW),
			async (context) => context.json(await catalogService.listCategories()),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.CATEGORIES_MANAGE),
			zodJson(categoryCreateSchema),
			async (context) =>
				context.json(
					await catalogService.createCategory(context.req.valid("json")),
					201,
				),
		)
		.patch(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.CATEGORIES_MANAGE),
			zodParams(resourceIdParamsSchema),
			zodJson(categoryUpdateSchema),
			async (context) =>
				context.json(
					await catalogService.updateCategory(
						context.req.valid("param").id,
						context.req.valid("json"),
					),
				),
		)
		.delete(
			"/:id",
			auth(authService),
			rbac(PERMISSIONS.CATEGORIES_MANAGE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await catalogService.deleteCategory(context.req.valid("param").id),
				),
		);
}

export function createProductRoutes(
	authService: AuthService,
	catalogService: CatalogService,
) {
	return new Hono<AppEnv>()
		.get(
			"/",
			auth(authService),
			rbac(PERMISSIONS.STOCK_VIEW),
			zodQuery(archivedFilterSchema),
			async (context) =>
				context.json(
					await catalogService.listProducts(
						context.req.valid("query").archived,
					),
				),
		)
		.post(
			"/",
			auth(authService),
			rbac(PERMISSIONS.PRODUCTS_CREATE_PUBLISH),
			zodJson(productCreateSchema),
			async (context) =>
				context.json(
					await catalogService.createProduct(
						context.req.valid("json"),
						context.get("authUser").id,
					),
					201,
				),
		)
		.patch(
			"/:id",
			auth(authService),
			rbacAny([
				PERMISSIONS.PRODUCTS_CREATE_PUBLISH,
				PERMISSIONS.PRODUCTS_EDIT_PUBLISHED,
			]),
			zodParams(resourceIdParamsSchema),
			zodJson(productUpdateSchema),
			async (context) =>
				context.json(
					await catalogService.updateProduct(
						context.req.valid("param").id,
						context.req.valid("json"),
						context.get("authUser").roles,
					),
				),
		)
		.post(
			"/:id/publish",
			auth(authService),
			rbac(PERMISSIONS.PRODUCTS_CREATE_PUBLISH),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await catalogService.publishProduct(context.req.valid("param").id),
				),
		)
		.post(
			"/:id/archive",
			auth(authService),
			rbac(PERMISSIONS.PRODUCTS_ARCHIVE),
			zodParams(resourceIdParamsSchema),
			async (context) =>
				context.json(
					await catalogService.archiveProduct(context.req.valid("param").id),
				),
		);
}
