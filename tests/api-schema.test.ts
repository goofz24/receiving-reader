// The Claude API refuses a structured-output schema that is too complex.
// Limits (platform docs, structured outputs): at most 24 optional fields and at most
// 16 fields with union types ("anyOf" or a list of types, e.g. string-or-null).
// The first real run hit the 16 limit, so this test checks the schema we actually send.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionForApi, fromApi } from "../src/shared/schema";
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

  it("stays inside the structured-output limits", () => {
    const { optional, unions } = countFields(sent);
    expect(unions).toBeLessThanOrEqual(16);
    expect(optional).toBeLessThanOrEqual(24);
    expect(unions).toBe(0);
    expect(optional).toBe(18);
  });

  it("keeps the field descriptions", () => {
    const text = JSON.stringify(sent);
    expect(text).toContain("crossed out a number");
    expect(text).toContain("CS/24");
    expect(text).toContain("YYYY-MM-DD");
  });
});

describe("fromApi", () => {
  it("turns fields the model left out into null", () => {
    const answer = {
      document_type: "packing_slip",
      language: "en",
      supplier_name: "Harborline Supply",
      line_items: [{ description: "Paper towels", quantity: 4, confidence: "high" }],
      warnings: [],
    };
    const out = fromApi(answer);
    expect(out.po_number).toBeNull();
    expect(out.total).toBeNull();
    expect(out.line_items[0].sku).toBeNull();
    expect(out.line_items[0].unit_price).toBeNull();
    expect(out.line_items[0].quantity).toBe(4);
  });

  it("passes a complete answer through unchanged", () => {
    const full = doc();
    expect(fromApi(full)).toEqual(full);
  });

  it("rejects an answer with the wrong shape", () => {
    expect(() => fromApi({ document_type: "receipt" })).toThrow();
  });
});
