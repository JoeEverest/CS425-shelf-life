export type AdjustmentRuleInput = {
	deltaUnits: number;
	note: string;
};

export function isValidAdjustment(input: AdjustmentRuleInput): boolean {
	return (
		Number.isInteger(input.deltaUnits) &&
		input.deltaUnits !== 0 &&
		input.note.trim().length >= 3
	);
}
