export type StockVelocityInput = {
	qtyUnits: number;
	unitsSoldInWindow: number;
	windowDays: number;
	coverDays: number;
};

export type StockVelocityResult = {
	velocityPerDay: number;
	daysToStockout: number | null;
	low: boolean;
};

export function calculateStockVelocity(
	input: StockVelocityInput,
): StockVelocityResult {
	if (input.unitsSoldInWindow <= 0 || input.windowDays <= 0) {
		return { velocityPerDay: 0, daysToStockout: null, low: false };
	}

	const velocityPerDay = input.unitsSoldInWindow / input.windowDays;
	const daysToStockout = input.qtyUnits / velocityPerDay;
	return {
		velocityPerDay,
		daysToStockout,
		low: daysToStockout <= input.coverDays,
	};
}
