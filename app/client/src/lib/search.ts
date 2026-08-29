/**
 * Matches a person by name or phone. Digits are compared without formatting,
 * so "712 000" finds "+255 712 000 111".
 */
export function matchesNameOrPhone(
	name: string,
	phone: string | null,
	query: string,
): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") {
		return true;
	}
	if (name.toLowerCase().includes(q)) {
		return true;
	}
	const stored = (phone ?? "").toLowerCase();
	const digits = q.replace(/\D/g, "");
	if (digits !== "" && stored.replace(/\D/g, "").includes(digits)) {
		return true;
	}
	return stored.includes(q);
}
