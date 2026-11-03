import { describe, expect, it } from "vitest";
import { matchLines, sameCompany, scoreDocument, summarize, wordOverlap } from "../src/shared/score";
import { doc, line } from "./fixtures";

describe("scoring helpers", () => {
  it("treats company names with or without Inc/LLC and accents as the same", () => {
    expect(sameCompany("Café La Ceiba, Inc.", "CAFE LA CEIBA")).toBe(true);
    expect(sameCompany("Acme", "Apex")).toBe(false);
  });

  it("measures word overlap ignoring case and accents", () => {
    expect(wordOverlap("Café molido 14 oz", "CAFE MOLIDO 14OZ")).toBe(0.5);
    expect(wordOverlap("Plátanos", "platanos")).toBe(1);
  });

  it("pairs lines by SKU first, then by description", () => {
    const expected = [line({ sku: "A" }), line({ sku: null, description: "Green bananas" })];
    const got = [line({ sku: null, description: "green bananas" }), line({ sku: "a" })];
    expect(matchLines(expected, got)).toEqual([1, 0]);
  });
});

describe("scoreDocument", () => {
  it("gives full marks for a perfect reading", () => {
    const s = scoreDocument(doc(), doc(), []);
    expect(s.correct).toBe(s.total);
    expect(s.total).toBe(11 + 8);
  });

  it("counts wrong fields and missed lines", () => {
    const expected = doc({ line_items: [line(), line({ sku: "B-2" })], subtotal: 20, total: 20 });
    const got = doc({ line_items: [line({ quantity: 3 })], subtotal: 20, total: 20 });
    const s = scoreDocument(expected, got, []);
    const wrong = s.fields.filter((f) => !f.ok);
    expect(wrong.map((f) => `${f.where}:${f.field}`)).toEqual([
      "line 1:quantity",
      ...[
        "sku",
        "description",
        "quantity",
        "unit",
        "pack_size",
        "quantity_backordered",
        "unit_price",
        "line_total",
      ].map((f) => `line 2:${f}`),
    ]);
    expect(s.linesMatched).toBe(1);
  });

  it("counts invented lines as extra lines", () => {
    const s = scoreDocument(
      doc(),
      doc({ line_items: [line(), line({ sku: "Z", description: "Something else" })] }),
      [],
    );
    expect(s.extraLines).toBe(1);
  });

  it("reports which planted problems were caught and any false alarms", () => {
    const got = doc({ line_items: [line({ line_total: 11 })], subtotal: 11, total: 11 });
    const s = scoreDocument(doc(), got, ["line_math", "total_mismatch"]);
    expect(s.caughtFlags).toEqual(["line_math"]);
    expect(s.missedFlags).toEqual(["total_mismatch"]);
    const clean = scoreDocument(doc(), doc({ subtotal: 12, total: 12 }), []);
    expect(clean.extraProblemFlags).toEqual(["subtotal_mismatch"]);
  });
});

describe("summarize", () => {
  it("adds up documents and lists the weakest fields first", () => {
    const a = scoreDocument(doc(), doc({ document_date: "2026-01-10" }), []);
    const b = scoreDocument(doc(), doc(), []);
    const sum = summarize([a, b]);
    expect(sum.documents).toBe(2);
    expect(sum.total).toBe(38);
    expect(sum.correct).toBe(37);
    expect(sum.byField[0]).toMatchObject({ field: "document_date", correct: 1, total: 2 });
  });
});
