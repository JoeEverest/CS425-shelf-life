import { describe, expect, test } from "bun:test";
import { PERMISSIONS } from "shared";
import { isValidAdjustment } from "../src/rules/adjustment";
import {
	canEditProduct,
	canPublishProduct,
	requiredProductEditPermission,
} from "../src/rules/product-state";
import { isValidUnitBreakdown } from "../src/rules/unit-breakdown";

describe("catalog and inventory rules", () => {
	test("unit breakdowns must be positive whole numbers", () => {
		expect(isValidUnitBreakdown(1)).toBe(true);
		expect(isValidUnitBreakdown(12)).toBe(true);
		expect(isValidUnitBreakdown(0)).toBe(false);
		expect(isValidUnitBreakdown(-1)).toBe(false);
		expect(isValidUnitBreakdown(1.5)).toBe(false);
	});

	test("draft and published products require their respective permissions", () => {
		expect(requiredProductEditPermission(false)).toBe(
			PERMISSIONS.PRODUCTS_CREATE_PUBLISH,
		);
		expect(requiredProductEditPermission(true)).toBe(
			PERMISSIONS.PRODUCTS_EDIT_PUBLISHED,
		);
		expect(canEditProduct(false, [PERMISSIONS.PRODUCTS_CREATE_PUBLISH])).toBe(
			true,
		);
		expect(canEditProduct(true, [PERMISSIONS.PRODUCTS_CREATE_PUBLISH])).toBe(
			false,
		);
		expect(canEditProduct(true, [PERMISSIONS.PRODUCTS_EDIT_PUBLISHED])).toBe(
			true,
		);
	});

	test("only drafts can transition to published", () => {
		expect(canPublishProduct(false)).toBe(true);
		expect(canPublishProduct(true)).toBe(false);
	});

	test("adjustments require a nonzero integer delta and meaningful note", () => {
		expect(isValidAdjustment({ deltaUnits: 2, note: "Count correction" })).toBe(
			true,
		);
		expect(isValidAdjustment({ deltaUnits: 0, note: "Count correction" })).toBe(
			false,
		);
		expect(
			isValidAdjustment({ deltaUnits: 1.5, note: "Count correction" }),
		).toBe(false);
		expect(isValidAdjustment({ deltaUnits: -1, note: "  " })).toBe(false);
		expect(isValidAdjustment({ deltaUnits: -1, note: "ab" })).toBe(false);
	});
});
