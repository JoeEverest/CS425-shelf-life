export function moneyToCents(value: string): bigint {
	const match = /^(-?)(\d+)\.(\d{2})$/.exec(value);
	if (!match) {
		throw new Error(`Invalid database money value: ${value}`);
	}

	const [, sign, whole, fraction] = match;
	const cents = BigInt(whole ?? "0") * 100n + BigInt(fraction ?? "0");
	return sign === "-" ? -cents : cents;
}

export function centsToMoney(value: bigint): string {
	const negative = value < 0n;
	const absolute = negative ? -value : value;
	const whole = absolute / 100n;
	const fraction = (absolute % 100n).toString().padStart(2, "0");
	return `${negative ? "-" : ""}${whole}.${fraction}`;
}
