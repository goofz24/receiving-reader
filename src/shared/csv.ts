// Turn a checked document into a CSV file that opens in Excel or Google Sheets.
// One row per line item, with the document details repeated on every row
// so the file still makes sense after sorting or filtering.

import type { Extraction } from "./schema";

const COLUMNS = [
  "supplier",
  "document_type",
  "document_number",
  "document_date",
  "po_number",
  "line",
  "sku",
  "description",
  "quantity",
  "unit",
  "pack_size",
  "quantity_backordered",
  "unit_price",
  "line_total",
  "checked_by_person",
  "flags",
] as const;

/** Quote a value for CSV: wrap in quotes when it has a comma, quote or line break. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Stop spreadsheet formula injection: a cell starting with = + - @ would run as a formula.
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(doc: Extraction, options: { checkedLines?: boolean[]; flagsByLine?: string[][] } = {}): string {
  const rows = doc.line_items.map((item, i) =>
    [
      doc.supplier_name,
      doc.document_type,
      doc.document_number,
      doc.document_date,
      doc.po_number,
      i + 1,
      item.sku,
      item.description,
      item.quantity,
      item.unit,
      item.pack_size,
      item.quantity_backordered,
      item.unit_price,
      item.line_total,
      options.checkedLines?.[i] ? "yes" : "no",
      (options.flagsByLine?.[i] ?? []).join("; "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
