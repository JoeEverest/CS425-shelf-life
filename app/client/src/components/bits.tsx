import type { ReactNode } from "react";
import { useStore } from "@/api/hooks";

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<header className="flex flex-wrap items-end justify-between gap-4 pb-6">
			<div className="space-y-1">
				<h1 className="font-display text-2xl font-semibold tracking-tight">
					{title}
				</h1>
				{description ? (
					<p className="max-w-prose text-sm text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action}
		</header>
	);
}

export function Money({ value }: { value: string | number | null }) {
	const { data: store } = useStore();
	if (value === null) {
		return <span className="text-muted-foreground">—</span>;
	}
	const amount = typeof value === "number" ? value.toFixed(2) : value;
	return (
		<span className="tabular-nums">
			{store ? `${store.currency} ${amount}` : amount}
		</span>
	);
}

export function Qty({ value, unit }: { value: number; unit?: string }) {
	return (
		<span className="tabular-nums">
			{value.toLocaleString()}
			{unit ? <span className="ml-1 text-muted-foreground">{unit}</span> : null}
		</span>
	);
}

export function EmptyState({
	title,
	hint,
	action,
}: {
	title: string;
	hint: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-6 py-10">
			<p className="font-medium">{title}</p>
			<p className="max-w-prose text-sm text-muted-foreground">{hint}</p>
			{action}
		</div>
	);
}

export function ErrorNote({ message }: { message: string }) {
	return (
		<p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{message}
		</p>
	);
}
