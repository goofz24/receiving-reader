// The Claude API refuses a structured-output schema that is too complex.
// Explicit limits (platform docs, structured outputs): at most 24 optional fields and
// at most 16 fields with union types ("anyOf" or a list of types, e.g. string-or-null).
// On top of that, each optional or union field roughly doubles part of the compiled
// grammar. Run 1 hit the union limit; run 2 (18 optional fields) was refused as
// "Schema is too complex". So the schema we send now has none of either.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionForApi, fromApi, parseAmount } from "../src/shared/schema";
import { doc } from "./fixtures";

type Node = Record<string, unknown>;

function countFields(schema: Node) {
  const defs = (schema.$defs ?? {}) as Record<string, Node>;
  const resolve = (n: Node): Node => (typeof n.$ref === "string" ? resolve(defs[n.$ref.split("/").pop()!]) : n);
  let optional = 0;
  let unions = 0;
  const walk = (raw: Node) => {
    const n = resolve(raw);
    if (n.type === "object" && n.properties) {
      const required = new Set((n.required ?? []) as string[]);
      for (const [key, child] of Object.entries(n.properties as Record<string, Node>)) {
        if (!required.has(key)) optional++;
        const c = resolve(child);
        if (c.anyOf || c.oneOf || Array.isArray(c.type)) unions++;
        walk(c);
      }
    }
    if (n.type === "array" && n.items) walk(n.items as Node);
    for (const k of ["anyOf", "oneOf"]) for (const option of (n[k] ?? []) as Node[]) walk(option);
  };
  walk(schema);
  return { optional, unions };
}

describe("schema sent to the Claude API", () => {
  const sent = betaZodOutputFormat(ExtractionForApi).schema as Node;

  it("has no optional and no union-typed fields", () => {
    const { optional, unions } = countFields(sent);
    expect(unions).toBe(0);
    expect(optional).toBe(0);
  });

  it("sends the fixed choices as real enums, so the API enforces them", () => {
    // @anthropic-ai/sdk 1.4.0 turned enums into plain text, so the model could answer
    // anything and the answer failed our own check afterwards. Fixed in 1.7.0.
    const props = sent.properties as Record<string, Node>;
    expect(props.document_type.enum).toEqual(["packing_slip", "invoice", "other"]);
    expect(props.language.enum).toEqual(["en", "es", "mixed"]);
    const line = (props.line_items.items as Node).properties as Record<string, Node>;
    expect(line.confidence.enum).toEqual(["high", "medium", "low"]);
  });

  it("keeps the field descriptions", () => {
    const text = JSON.stringify(sent);
    expect(text).toContain("crossed out a number");
    expect(text).toContain("CS/24");
    expect(text).toContain("YYYY-MM-DD");
  });
});

describe("fromApi", () => {
  const answer = {
    document_type: "invoice",
    language: "es",
    supplier_name: "Distribuidora La Ceiba",
    document_number: "F-2210",
    document_date: "2026-10-14",
    po_number: "",
    currency: "USD",
    line_items: [
      {
        sku: "",
        description: "Arroz grano largo",
        quantity: "12",
        unit: "CS",
        pack_size: "",
        quantity_backordered: "",
        unit_price: "18,50",
        line_total: "222.00",
        confidence: "high",
        note: "",
      },
    ],
    subtotal: "$1,222.00",
    tax: "141.24",
    shipping: "",
    discount: "",
    total: "1363.24",
    warnings: [],
  };

  it("turns empty text into null and number text into numbers", () => {
    const out = fromApi(answer);
    expect(out.po_number).toBeNull();
    expect(out.shipping).toBeNull();
    expect(out.subtotal).toBe(1222);
    expect(out.total).toBe(1363.24);
    const line = out.line_items[0];
    expect(line.sku).toBeNull();
    expect(line.note).toBeNull();
    expect(line.quantity).toBe(12);
    expect(line.unit_price).toBe(18.5);
    expect(line.pack_size).toBeNull();
    expect(out.warnings).toEqual([]);
  });

  it("warns instead of guessing when a number cannot be read", () => {
    const out = fromApi({ ...answer, tax: "see page 2" });
    expect(out.tax).toBeNull();
    expect(out.warnings).toEqual(['Could not read the number "see page 2" for tax; left it empty.']);
  });

  it("passes an answer already in the app's shape through unchanged", () => {
    const full = doc();
    expect(fromApi(full)).toEqual(full);
  });

  it("rejects an answer with the wrong shape", () => {
    expect(() => fromApi({ document_type: "receipt" })).toThrow();
  });
});

describe("parseAmount", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["1234.50", 1234.5],
    ["$1,234.50", 1234.5],
    ["1.234,50", 1234.5],
    ["12,5", 12.5],
    ["1,234", 1234],
    ["(15.00)", -15],
    ["-3", -3],
    ["0", 0],
  ])("reads %j as %j", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it("returns undefined for text that is not a number", () => {
    expect(parseAmount("n/a")).toBeUndefined();
    expect(parseAmount("12 cases")).toBeUndefined();
  });
});
