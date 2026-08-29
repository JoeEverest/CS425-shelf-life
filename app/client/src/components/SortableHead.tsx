import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/hooks/use-sort";

export function SortableHead<Key extends string>({
	column,
	sort,
	onSort,
	className,
	children,
}: {
	column: Key;
	sort: SortState<Key>;
	onSort: (key: Key) => void;
	className?: string;
	children: ReactNode;
}) {
	const active = sort.key === column;
	const Icon = active
		? sort.direction === "asc"
			? ArrowUp
			: ArrowDown
		: ChevronsUpDown;

	return (
		<TableHead className={className}>
			<button
				type="button"
				onClick={() => onSort(column)}
				aria-label={`Sort by ${typeof children === "string" ? children : column}`}
				className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
			>
				{children}
				<Icon aria-hidden className={active ? "size-3" : "size-3 opacity-40"} />
			</button>
		</TableHead>
	);
}
