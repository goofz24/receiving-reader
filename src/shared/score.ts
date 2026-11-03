// Scoring: how close is the AI's reading to the answer key?
//
// Used by the evaluation script (eval/run-eval.ts). Everything here is plain
// code so the score is the same every time for the same inputs.
//
// How a document is scored:
//   - Header fields (supplier, numbers, date, totals...) are compared one by one.
//   - Line items are paired up by SKU (or by description when there is no SKU),
//     then each field on the line is compared.
//   - A line in the answer key that the AI missed counts every one of its fields as wrong.
//   - A line the AI invented is counted separately as an "extra line".

import { normalizeSku, runChecks, type FlagCode } from "./checks";
import type { Extraction, LineItem, PurchaseOrder } from "./schema";

export const HEADER_FIELDS = [
  "document_type",
  "language",
  "supplier_name",
  "document_number",
  "document_date",
  "po_number",
  "subtotal",
  "tax",
  "shipping",
  "discount",
  "total",
] as const;

export const LINE_FIELDS = [
  "sku",
  "description",
  "quantity",
  "unit",
  "pack_size",
  "quantity_backordered",
  "unit_price",
  "line_total",
] as const;

type HeaderField = (typeof HEADER_FIELDS)[number];
type LineField = (typeof LINE_FIELDS)[number];

export interface FieldResult {
  field: string;
  /** "header" or "line 3" */
  where: string;
  expected: unknown;
  got: unknown;
  ok: boolean;
}

export interface DocScore {
  fields: FieldResult[];
  correct: number;
  total: number;
  linesExpected: number;
  linesMatched: number;
  extraLines: number;
  expectedFlags: FlagCode[];
  caughtFlags: FlagCode[];
  missedFlags: FlagCode[];
  /** "problem" flags raised that the answer key did not expect (false alarms). */
  extraProblemFlags: FlagCode[];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop accents so "Café" == "Cafe"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Share of the answer key's words that the AI's text also contains (0 to 1). */
export function wordOverlap(expected: string, got: string): number {
  const e = words(expected);
  if (e.length === 0) return got.trim() === "" ? 1 : 0;
  const g = new Set(words(got));
  return e.filter((w) => g.has(w)).length / e.length;
}

const COMPANY_SUFFIXES = new Set(["inc", "llc", "corp", "co", "company", "corporation", "ltd", "csp", "lp"]);
export function sameCompany(a: string, b: string): boolean {
  const clean = (s: string) =>
    words(s)
      .filter((w) => !COMPANY_SUFFIXES.has(w))
      .join(" ");
  return clean(a) === clean(b);
}

const sameNumber = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.006;

const sameCode = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : normalizeSku(a) === normalizeSku(b);

const sameUnit = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : a.toUpperCase().replace(/\./g, "") === b.toUpperCase().replace(/\./g, "");

function compareHeader(field: HeaderField, expected: Extraction, got: Extraction): boolean {
  const e = expected[field];
  const g = got[field];
  switch (field) {
    case "supplier_name":
      return e === null || g === null ? e === g : sameCompany(e as string, g as string);
    case "document_number":
    case "po_number":
      return sameCode(e as string | null, g as string | null);
    case "subtotal":
    case "tax":
    case "shipping":
    case "discount":
    case "total":
      return sameNumber(e as number | null, g as number | null);
    default:
      return e === g;
  }
}

function compareLineField(field: LineField, e: LineItem, g: LineItem): boolean {
  switch (field) {
    case "sku":
      return sameCode(e.sku, g.sku);
    case "description":
      return wordOverlap(e.description, g.description) >= 0.6;
    case "unit":
      return sameUnit(e.unit, g.unit);
    default:
      return sameNumber(e[field], g[field]);
  }
}

/** Pair each answer-key line with at most one AI line. Returns AI line index per key line (or -1). */
export function matchLines(expected: LineItem[], got: LineItem[]): number[] {
  const used = new Set<number>();
  const pairs = expected.map(() => -1);

  // Pass 1: same SKU (in order, so duplicate SKUs pair up first-with-first).
  expected.forEach((e, i) => {
    if (e.sku === null) return;
    const j = got.findIndex((g, k) => !used.has(k) && g.sku !== null && normalizeSku(g.sku) === normalizeSku(e.sku!));
    if (j >= 0) {
      pairs[i] = j;
      used.add(j);
    }
  });

  // Pass 2: best description match for whatever is left.
  expected.forEach((e, i) => {
    if (pairs[i] >= 0) return;
    let best = -1;
    let bestScore = 0.5; // must share at least half the words
    got.forEach((g, k) => {
      if (used.has(k)) return;
      const s = wordOverlap(e.description, g.description);
      if (s > bestScore) {
        best = k;
        bestScore = s;
      }
    });
    if (best >= 0) {
      pairs[i] = best;
      used.add(best);
    }
  });
  return pairs;
}

export function scoreDocument(
  expected: Extraction,
  got: Extraction,
  expectedFlags: FlagCode[],
  orders: PurchaseOrder[] = [],
): DocScore {
  const fields: FieldResult[] = [];

  for (const f of HEADER_FIELDS) {
    fields.push({ field: f, where: "header", expected: expected[f], got: got[f], ok: compareHeader(f, expected, got) });
  }

  const pairs = matchLines(expected.line_items, got.line_items);
  pairs.forEach((j, i) => {
    const e = expected.line_items[i];
    const g = j >= 0 ? got.line_items[j] : null;
    for (const f of LINE_FIELDS) {
      fields.push({
        field: f,
        where: `line ${i + 1}`,
        expected: e[f],
        got: g ? g[f] : "(line missed)",
        ok: g ? compareLineField(f, e, g) : false,
      });
    }
  });

  const raised = runChecks(got, orders);
  const raisedCodes = new Set(raised.map((f) => f.code));
  const expectedSet = new Set(expectedFlags);
  const caughtFlags = expectedFlags.filter((c) => raisedCodes.has(c));
  const missedFlags = expectedFlags.filter((c) => !raisedCodes.has(c));
  const extraProblemFlags = [
    ...new Set(raised.filter((f) => f.severity === "problem" && !expectedSet.has(f.code)).map((f) => f.code)),
  ];

  const matched = pairs.filter((j) => j >= 0).length;
  return {
    fields,
    correct: fields.filter((f) => f.ok).length,
    total: fields.length,
    linesExpected: expected.line_items.length,
    linesMatched: matched,
    extraLines: got.line_items.length - matched,
    expectedFlags,
    caughtFlags,
    missedFlags,
    extraProblemFlags,
  };
}

export interface Summary {
  documents: number;
  fieldAccuracy: number;
  correct: number;
  total: number;
  linesExpected: number;
  linesMatched: number;
  extraLines: number;
  flagsExpected: number;
  flagsCaught: number;
  falseAlarmDocs: number;
  /** Per field name: how often it was right, worst first. */
  byField: { field: string; correct: number; total: number; accuracy: number }[];
}

export function summarize(scores: DocScore[]): Summary {
  const byField = new Map<string, { correct: number; total: number }>();
  for (const s of scores) {
    for (const f of s.fields) {
      const r = byField.get(f.field) ?? { correct: 0, total: 0 };
      r.total += 1;
      if (f.ok) r.correct += 1;
      byField.set(f.field, r);
    }
  }
  const correct = scores.reduce((a, s) => a + s.correct, 0);
  const total = scores.reduce((a, s) => a + s.total, 0);
  return {
    documents: scores.length,
    fieldAccuracy: total ? correct / total : 0,
    correct,
    total,
    linesExpected: scores.reduce((a, s) => a + s.linesExpected, 0),
    linesMatched: scores.reduce((a, s) => a + s.linesMatched, 0),
    extraLines: scores.reduce((a, s) => a + s.extraLines, 0),
    flagsExpected: scores.reduce((a, s) => a + s.expectedFlags.length, 0),
    flagsCaught: scores.reduce((a, s) => a + s.caughtFlags.length, 0),
    falseAlarmDocs: scores.filter((s) => s.extraProblemFlags.length > 0).length,
    byField: [...byField.entries()]
      .map(([field, r]) => ({ field, ...r, accuracy: r.correct / r.total }))
      .sort((a, b) => a.accuracy - b.accuracy || a.field.localeCompare(b.field)),
  };
}
