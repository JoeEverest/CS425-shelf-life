import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/api/hooks";
import { Input } from "@/components/ui/input";

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

export function SearchInput({
	value,
	onChange,
	label,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
	placeholder: string;
}) {
	return (
		<div className="relative w-full max-w-sm">
			<Search
				aria-hidden
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				aria-label={label}
				placeholder={placeholder}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="pl-9"
			/>
		</div>
	);
}

const moneyFormat = new Intl.NumberFormat(undefined, {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export function Money({ value }: { value: string | number | null }) {
	const { data: store } = useStore();
	if (value === null) {
		return <span className="text-muted-foreground">—</span>;
	}
	const numeric = typeof value === "number" ? value : Number(value);
	// Amounts arrive as decimal strings; keep the raw text if one is not a number.
	const amount = Number.isFinite(numeric)
		? moneyFormat.format(numeric)
		: String(value);
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
