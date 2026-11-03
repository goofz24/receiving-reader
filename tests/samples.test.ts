// The answer keys must be right, or the accuracy score means nothing.
// These tests check every sample against the plain-code checks:
// a perfect reading of each document must raise exactly the problems
// the sample was designed to have, and nothing else.

import { describe, expect, it } from "vitest";
import { runChecks } from "../src/shared/checks";
import { Extraction, PurchaseOrder } from "../src/shared/schema";
import { scoreDocument } from "../src/shared/score";
import { answerKey, purchaseOrder, totals } from "../samples/build";
import { SAMPLES } from "../samples/data";

const orders = SAMPLES.map(purchaseOrder).filter((p): p is PurchaseOrder => p !== null);

describe("sample documents", () => {
  it("has 18 samples with unique ids", () => {
    expect(SAMPLES).toHaveLength(18);
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(18);
  });

  it("mixes PDFs, photos, English and Spanish", () => {
    expect(SAMPLES.filter((s) => s.output === "photo").length).toBeGreaterThanOrEqual(4);
    expect(SAMPLES.filter((s) => s.language === "es").length).toBeGreaterThanOrEqual(3);
    expect(SAMPLES.filter((s) => s.document_type === "packing_slip").length).toBeGreaterThanOrEqual(6);
  });

  for (const s of SAMPLES) {
    describe(s.id, () => {
      const key = answerKey(s);

      it("answer key fits the schema", () => {
        expect(() => Extraction.parse(key)).not.toThrow();
      });

      it("raises exactly the planned problems", () => {
        const codes = new Set(runChecks(key, orders).map((f) => f.code));
        expect([...codes].sort()).toEqual([...new Set(s.expected_flags)].sort());
      });

      it("scores 100% against itself", () => {
        const score = scoreDocument(key, key, s.expected_flags, orders);
        expect(score.correct).toBe(score.total);
        expect(score.missedFlags).toEqual([]);
        expect(score.extraProblemFlags).toEqual([]);
      });
    });
  }

  it("invoice totals add up unless an error was planted", () => {
    for (const s of SAMPLES.filter((x) => x.document_type === "invoice")) {
      const t = totals(s);
      const expected = t.subtotal! + (t.tax ?? 0) + (t.shipping ?? 0) - (t.discount ?? 0);
      expect(t.total).toBeCloseTo(expected, 2);
    }
  });
});
