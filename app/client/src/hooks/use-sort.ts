import { useState } from "react";

export type SortDirection = "asc" | "desc";

export type SortState<Key extends string> = {
	key: Key;
	direction: SortDirection;
};

/** Column sorting for a table: click a column to sort, click again to reverse. */
export function useSortState<Key extends string>(
	initialKey: Key,
	initialDirection: SortDirection = "asc",
) {
	const [sort, setSort] = useState<SortState<Key>>({
		key: initialKey,
		direction: initialDirection,
	});

	function toggle(key: Key) {
		setSort((current) =>
			current.key === key
				? {
						key,
						direction: current.direction === "asc" ? "desc" : "asc",
					}
				: { key, direction: "asc" },
		);
	}

	return { sort, toggle };
}

/** Compares two cell values. Empty values always sort last. */
export function compareValues(
	left: string | number | null,
	right: string | number | null,
	direction: SortDirection,
): number {
	if (left === null && right === null) {
		return 0;
	}
	if (left === null) {
		return 1;
	}
	if (right === null) {
		return -1;
	}
	const result =
		typeof left === "number" && typeof right === "number"
			? left - right
			: String(left).localeCompare(String(right));
	return direction === "asc" ? result : -result;
}
