export function isValidUnitBreakdown(unitsPerBulk: number): boolean {
	return Number.isInteger(unitsPerBulk) && unitsPerBulk > 0;
}
