type ErrorWithDatabaseMetadata = {
	code?: unknown;
	constraint_name?: unknown;
	cause?: unknown;
};

export function isDatabaseError(
	error: unknown,
	code: string,
	constraintName?: string,
): boolean {
	const seen = new Set<unknown>();
	let current = error;

	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		seen.add(current);
		const candidate = current as ErrorWithDatabaseMetadata;
		if (
			candidate.code === code &&
			(constraintName === undefined ||
				candidate.constraint_name === constraintName)
		) {
			return true;
		}
		current = candidate.cause;
	}

	return false;
}
