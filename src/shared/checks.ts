// Plain-code checks that run AFTER the AI has read the document.
//
// The AI reads the paper. These checks decide what a person must look at.
// They are ordinary TypeScript (no AI), so they always give the same answer
// for the same data and are covered by unit tests.
//
// Two groups:
//   - Math checks: does the paper add up? (qty x price, subtotal, total)
//   - Receiving checks: does the paper match what we ordered? (purchase order)

import type { Extraction, PurchaseOrder } from "./schema";

export type FlagCode =
  | "line_math"
  | "subtotal_mismatch"
  | "total_mismatch"
  | "missing_quantity"
  | "missing_sku"
  | "low_confidence"
  | "duplicate_sku"
  | "po_missing"
  | "po_not_found"
  | "qty_short"
  | "qty_over"
  | "backordered"
  | "not_on_po"
  | "missing_from_shipment"
  | "price_mismatch"
  | "unit_mismatch"
  | "model_warning";

export type Severity = "problem" | "check";

export interface Flag {
  code: FlagCode;
  severity: Severity;
  /** Index into extraction.line_items, when the flag is about one line. */
  line?: number;
  /** SKU the flag is about, when there is one (used for PO lines not on the paper). */
  sku?: string;
  message: string;
}

/** Money is compared to the cent. A tiny extra allowance absorbs floating point noise. */
const CENT = 0.011;

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Same SKU even if one side has different spacing, dashes or capital letters. */
export function normalizeSku(sku: string): string {
  return sku.toUpperCase().replace(/[\s\-_.]/g, "");
}

/** Units that mean "one item". Everything else (CS, BX, PK...) is treated as a pack. */
const EACH_UNITS = new Set(["EA", "EACH", "UN", "UNIDAD", "UNIT", "PC", "PCS"]);
export function isEachUnit(unit: string | null): boolean {
  return unit !== null && EACH_UNITS.has(unit.toUpperCase().replace(/\./g, ""));
}

export function checkMath(doc: Extraction): Flag[] {
  const flags: Flag[] = [];

  doc.line_items.forEach((item, i) => {
    if (item.quantity !== null && item.unit_price !== null && item.line_total !== null) {
      const expected = round2(item.quantity * item.unit_price);
      if (Math.abs(expected - item.line_total) > CENT) {
        flags.push({
          code: "line_math",
          severity: "problem",
          line: i,
          message: `${item.quantity} x ${money(item.unit_price)} = ${money(expected)}, but the line says ${money(item.line_total)}.`,
        });
      }
    }
  });

  const totals = doc.line_items.map((l) => l.line_total);
  if (doc.subtotal !== null && totals.length > 0 && totals.every((t) => t !== null)) {
    const sum = round2((totals as number[]).reduce((a, b) => a + b, 0));
    if (Math.abs(sum - doc.subtotal) > CENT) {
      flags.push({
        code: "subtotal_mismatch",
        severity: "problem",
        message: `The lines add up to ${money(sum)}, but the subtotal says ${money(doc.subtotal)}.`,
      });
    }
  }

  if (doc.subtotal !== null && doc.total !== null) {
    const expected = round2(doc.subtotal + (doc.tax ?? 0) + (doc.shipping ?? 0) - (doc.discount ?? 0));
    if (Math.abs(expected - doc.total) > CENT) {
      flags.push({
        code: "total_mismatch",
        severity: "problem",
        message: `Subtotal + tax + shipping - discount = ${money(expected)}, but the total says ${money(doc.total)}.`,
      });
    }
  }

  return flags;
}

export function checkLines(doc: Extraction): Flag[] {
  const flags: Flag[] = [];
  const seen = new Map<string, number>();

  doc.line_items.forEach((item, i) => {
    if (item.quantity === null) {
      flags.push({
        code: "missing_quantity",
        severity: "problem",
        line: i,
        message: "No quantity could be read for this line.",
      });
    }
    if (item.sku === null) {
      flags.push({
        code: "missing_sku",
        severity: "check",
        line: i,
        message: "No item number on this line. Match it to the order by description.",
      });
    } else {
      const key = normalizeSku(item.sku);
      const first = seen.get(key);
      if (first !== undefined) {
        flags.push({
          code: "duplicate_sku",
          severity: "check",
          line: i,
          message: `Item ${item.sku} appears more than once (also line ${first + 1}). Quantities are added together for the order check.`,
        });
      } else {
        seen.set(key, i);
      }
    }
    if (item.confidence === "low") {
      flags.push({
        code: "low_confidence",
        severity: "check",
        line: i,
        message: item.note
          ? `The reader was not sure about this line: ${item.note}`
          : "The reader was not sure it read this line correctly.",
      });
    }
  });

  for (const w of doc.warnings) {
    flags.push({ code: "model_warning", severity: "check", message: w });
  }
  return flags;
}

interface ReceivedTotal {
  quantity: number;
  backordered: number;
  firstLine: number;
  unit: string | null;
  unitPrice: number | null;
  /** false when the units could not be converted, so counts can't be compared. */
  comparable: boolean;
}

/**
 * Compare the paper with the purchase order.
 * Pass every PO you have; the one matching the document's PO number is used.
 */
export function checkAgainstPurchaseOrder(doc: Extraction, orders: PurchaseOrder[]): Flag[] {
  if (orders.length === 0) return [];
  if (doc.po_number === null) {
    return [
      {
        code: "po_missing",
        severity: "check",
        message: "No PO number found on the document, so it could not be matched to an order.",
      },
    ];
  }
  const po = orders.find((o) => normalizeSku(o.po_number) === normalizeSku(doc.po_number!));
  if (!po) {
    return [
      {
        code: "po_not_found",
        severity: "problem",
        message: `PO ${doc.po_number} is not one of our open purchase orders.`,
      },
    ];
  }

  const flags: Flag[] = [];
  const orderLines = new Map(po.lines.map((l) => [normalizeSku(l.sku), l]));

  // Add up what the paper says arrived, per SKU, converted to the PO's unit when we can.
  const received = new Map<string, ReceivedTotal>();
  doc.line_items.forEach((item, i) => {
    if (item.sku === null || item.quantity === null) return;
    const key = normalizeSku(item.sku);
    const ordered = orderLines.get(key);
    if (!ordered) {
      flags.push({
        code: "not_on_po",
        severity: "problem",
        line: i,
        message: `Item ${item.sku} is not on PO ${po.po_number}. It may be a substitution. Check before accepting.`,
      });
      return;
    }

    let qty = item.quantity;
    let back = item.quantity_backordered ?? 0;
    let comparable = true;
    const sameUnit = item.unit === null || item.unit.toUpperCase() === ordered.unit.toUpperCase();
    if (!sameUnit) {
      if (isEachUnit(ordered.unit) && !isEachUnit(item.unit) && item.pack_size !== null) {
        // Paper says cases, PO says each: 3 CS of 24 = 72 EA.
        qty *= item.pack_size;
        back *= item.pack_size;
      } else {
        comparable = false;
        flags.push({
          code: "unit_mismatch",
          severity: "check",
          line: i,
          message: `The paper counts this item in ${item.unit}, the PO in ${ordered.unit}, and no pack size is printed. Count by hand.`,
        });
      }
    }

    const prev = received.get(key);
    received.set(key, {
      quantity: (prev?.quantity ?? 0) + qty,
      backordered: (prev?.backordered ?? 0) + back,
      firstLine: prev?.firstLine ?? i,
      unit: item.unit,
      unitPrice: prev?.unitPrice ?? item.unit_price,
      comparable: (prev?.comparable ?? true) && comparable,
    });
  });

  for (const [key, ordered] of orderLines) {
    const got = received.get(key);
    if (!got) {
      // Lines skipped above (no SKU or no quantity) are already flagged, so only report true absences.
      flags.push({
        code: "missing_from_shipment",
        severity: "problem",
        sku: ordered.sku,
        message: `${ordered.sku} (${ordered.description}): ${ordered.quantity_ordered} ${ordered.unit} ordered, not on this document.`,
      });
      continue;
    }
    if (!got.comparable) continue; // already flagged as unit_mismatch: a person counts it
    const line = got.firstLine;
    if (got.quantity < ordered.quantity_ordered) {
      const missing = ordered.quantity_ordered - got.quantity;
      if (got.backordered > 0 && got.quantity + got.backordered >= ordered.quantity_ordered) {
        flags.push({
          code: "backordered",
          severity: "check",
          line,
          sku: ordered.sku,
          message: `${missing} ${ordered.unit} of ${ordered.sku} are back-ordered. Keep the PO line open.`,
        });
      } else {
        flags.push({
          code: "qty_short",
          severity: "problem",
          line,
          sku: ordered.sku,
          message: `Short shipment: ordered ${ordered.quantity_ordered} ${ordered.unit}, document shows ${got.quantity}${got.backordered ? ` (+${got.backordered} back-ordered)` : ""}.`,
        });
      }
    } else if (got.quantity > ordered.quantity_ordered) {
      flags.push({
        code: "qty_over",
        severity: "problem",
        line,
        sku: ordered.sku,
        message: `Over shipment: ordered ${ordered.quantity_ordered} ${ordered.unit}, document shows ${got.quantity}.`,
      });
    }

    // Price check only when both sides use the same unit, otherwise prices are not comparable.
    if (
      doc.document_type === "invoice" &&
      ordered.unit_price !== null &&
      got.unitPrice !== null &&
      (got.unit === null || got.unit.toUpperCase() === ordered.unit.toUpperCase()) &&
      Math.abs(got.unitPrice - ordered.unit_price) > CENT
    ) {
      flags.push({
        code: "price_mismatch",
        severity: "problem",
        line,
        sku: ordered.sku,
        message: `Billed ${money(got.unitPrice)} per ${ordered.unit}, the PO price is ${money(ordered.unit_price)}.`,
      });
    }
  }

  return flags;
}

/** Every check in one call. This is what the review screen and the evaluation use. */
export function runChecks(doc: Extraction, orders: PurchaseOrder[] = []): Flag[] {
  return [...checkMath(doc), ...checkLines(doc), ...checkAgainstPurchaseOrder(doc, orders)];
}
