import { sql } from "drizzle-orm";
import { check, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { goodsReceipts } from "./goods-receipts";
import { poLines } from "./po-lines";

export const receiptLines = pgTable(
	"receipt_lines",
	{
		id: id(),
		receiptId: uuid("receipt_id")
			.notNull()
			.references(() => goodsReceipts.id),
		poLineId: uuid("po_line_id")
			.notNull()
			.references(() => poLines.id),
		qtyBulkReceived: integer("qty_bulk_received").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"receipt_lines_qty_bulk_received_nonnegative",
			sql`${table.qtyBulkReceived} >= 0`,
		),
	],
);
