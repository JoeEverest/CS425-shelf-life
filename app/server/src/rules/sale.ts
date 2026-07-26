type ProductLine = { productId: string };

export function hasDuplicateProducts(lines: readonly ProductLine[]): boolean {
	return new Set(lines.map((line) => line.productId)).size !== lines.length;
}
