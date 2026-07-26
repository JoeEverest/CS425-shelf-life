import type { GoodsReceiptCreateInput } from "shared";
import { moneyToCents } from "./money";

/**
 * A partial delivery (receiving fewer bulk units than remain on the order) is a
 * normal flow — the PO simply stays open (UC-10 4.2.3). A *discrepancy* is a
 * problem the receiver explicitly flags with a note (short-shipped, damaged,
 * count mismatch), and only that requires manager confirmation (UC-10 4.3.1).
 */
export function isFlaggedDiscrepancy(
	discrepancyNote: string | undefined,
): boolean {
	return discrepancyNote !== undefined && discrepancyNote.trim().length > 0;
}

export function resolveReceiptPayment(
	receivedValueCents: bigint,
	payment: GoodsReceiptCreateInput["payment"],
): { paidNowCents: bigint; liabilityCents: bigint } | undefined {
	let paidNowCents: bigint;
	if (payment.kind === "immediate") {
		paidNowCents = receivedValueCents;
	} else if (payment.kind === "deferred") {
		paidNowCents = 0n;
	} else {
		paidNowCents = moneyToCents(payment.amount);
		if (paidNowCents <= 0n || paidNowCents > receivedValueCents) {
			return undefined;
		}
	}

	return {
		paidNowCents,
		liabilityCents: receivedValueCents - paidNowCents,
	};
}
