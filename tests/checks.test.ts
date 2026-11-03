import { describe, expect, it } from "vitest";
import { checkAgainstPurchaseOrder, checkLines, checkMath, normalizeSku, runChecks } from "../src/shared/checks";
import { doc, line, po } from "./fixtures";

const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

describe("math checks", () => {
  it("passes a document that adds up", () => {
    expect(checkMath(doc())).toEqual([]);
  });

  it("catches a wrong line total and says which line", () => {
    const flags = checkMath(doc({ line_items: [line(), line({ line_total: 11 })], subtotal: 21, total: 21 }));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "line_math", line: 1, severity: "problem" });
  });

  it("ignores floating point noise (3 x 0.1)", () => {
    expect(
      checkMath(
        doc({ line_items: [line({ quantity: 3, unit_price: 0.1, line_total: 0.3 })], subtotal: 0.3, total: 0.3 }),
      ),
    ).toEqual([]);
  });

  it("catches a subtotal that does not match the lines", () => {
    expect(codes(checkMath(doc({ subtotal: 12, total: 12 })))).toEqual(["subtotal_mismatch"]);
  });

  it("checks total = subtotal + tax + shipping - discount", () => {
    expect(checkMath(doc({ tax: 1, shipping: 2, discount: 0.5, total: 12.5 }))).toEqual([]);
    expect(codes(checkMath(doc({ tax: 1, total: 10 })))).toEqual(["total_mismatch"]);
  });

  it("skips the subtotal check when a line total is unreadable", () => {
    expect(checkMath(doc({ line_items: [line({ line_total: null })], subtotal: 99, total: 99 }))).toEqual([]);
  });
});

describe("line checks", () => {
  it("flags missing quantity, missing SKU, low confidence and duplicates", () => {
    const flags = checkLines(
      doc({
        line_items: [
          line(),
          line({ quantity: null }),
          line({ sku: null }),
          line({ sku: "a 1", confidence: "low", note: "smudged" }),
        ],
      }),
    );
    expect(codes(flags)).toEqual([
      "missing_quantity",
      "duplicate_sku",
      "missing_sku",
      "duplicate_sku",
      "low_confidence",
    ]);
    expect(flags.at(-1)!.message).toContain("smudged");
  });

  it("passes the model's own warnings through", () => {
    expect(checkLines(doc({ warnings: ["Page 2 seems missing"] }))).toEqual([
      { code: "model_warning", severity: "check", message: "Page 2 seems missing" },
    ]);
  });

  it("normalizes SKUs", () => {
    expect(normalizeSku(" tp-10 332 ")).toBe("TP10332");
  });
});

describe("purchase order checks", () => {
  it("does nothing when no orders are loaded", () => {
    expect(checkAgainstPurchaseOrder(doc(), [])).toEqual([]);
  });

  it("matches a PO even with different punctuation", () => {
    expect(checkAgainstPurchaseOrder(doc({ po_number: "PO 1" }), [po({ po_number: "po-1" })])).toEqual([]);
  });

  it("flags a missing or unknown PO number", () => {
    expect(codes(checkAgainstPurchaseOrder(doc({ po_number: null }), [po()]))).toEqual(["po_missing"]);
    expect(codes(checkAgainstPurchaseOrder(doc({ po_number: "PO-9" }), [po()]))).toEqual(["po_not_found"]);
  });

  it("flags short and over shipments", () => {
    expect(
      codes(checkAgainstPurchaseOrder(doc({ line_items: [line({ quantity: 1, line_total: 5 })] }), [po()])),
    ).toEqual(["qty_short"]);
    expect(
      codes(checkAgainstPurchaseOrder(doc({ line_items: [line({ quantity: 3, line_total: 15 })] }), [po()])),
    ).toEqual(["qty_over"]);
  });

  it("treats a short line covered by a back-order as a back-order, not a shortage", () => {
    const d = doc({ document_type: "packing_slip", line_items: [line({ quantity: 1, quantity_backordered: 1 })] });
    expect(codes(checkAgainstPurchaseOrder(d, [po()]))).toEqual(["backordered"]);
  });

  it("adds duplicate lines together before comparing", () => {
    const d = doc({ line_items: [line({ quantity: 1, line_total: 5 }), line({ quantity: 1, line_total: 5 })] });
    expect(checkAgainstPurchaseOrder(d, [po()])).toEqual([]);
  });

  it("flags substitutions: an item not on the PO, and the ordered item missing", () => {
    const d = doc({ line_items: [line({ sku: "B-2" })] });
    expect(codes(checkAgainstPurchaseOrder(d, [po()]))).toEqual(["not_on_po", "missing_from_shipment"]);
  });

  it("converts cases to eaches when the pack size is printed", () => {
    const d = doc({
      line_items: [line({ quantity: 2, unit: "CS", pack_size: 12, unit_price: 30, line_total: 60 })],
      subtotal: 60,
      total: 60,
    });
    const order = po({
      lines: [{ sku: "A-1", description: "Widget", quantity_ordered: 24, unit: "EA", unit_price: 2.5 }],
    });
    expect(checkAgainstPurchaseOrder(d, [order])).toEqual([]);
  });

  it("asks for a hand count when units differ and no pack size is printed", () => {
    const d = doc({ line_items: [line({ quantity: 2, unit: "BX" })] });
    const order = po({
      lines: [{ sku: "A-1", description: "Widget", quantity_ordered: 200, unit: "EA", unit_price: 0.05 }],
    });
    expect(codes(checkAgainstPurchaseOrder(d, [order]))).toEqual(["unit_mismatch"]);
  });

  it("flags an invoice price that differs from the PO price", () => {
    const d = doc({ line_items: [line({ unit_price: 6, line_total: 12 })], subtotal: 12, total: 12 });
    expect(codes(checkAgainstPurchaseOrder(d, [po()]))).toEqual(["price_mismatch"]);
  });

  it("does not compare prices on packing slips", () => {
    const d = doc({ document_type: "packing_slip", line_items: [line({ unit_price: 6, line_total: 12 })] });
    expect(checkAgainstPurchaseOrder(d, [po()])).toEqual([]);
  });

  it("runChecks combines everything", () => {
    expect(codes(runChecks(doc({ subtotal: 11, total: 11, po_number: null }), [po()]))).toEqual([
      "subtotal_mismatch",
      "po_missing",
    ]);
  });
});
