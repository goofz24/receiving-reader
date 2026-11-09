// The shape of the data we want back from a packing slip or invoice.
//
// `Extraction` is the shape the rest of the app uses. A field the paper does not
// show is null. It also gives TypeScript the `Extraction` type used everywhere.
//
// The Claude API gets a slightly different copy, `ExtractionForApi`, where those
// fields are optional instead of nullable. Reason: structured outputs allow at
// most 16 fields that can be "this type OR null" in one request, and we have 18.
// Optional fields are allowed up to 24. `fromApi()` turns the answer back into an
// `Extraction` (a field the model left out becomes null) and checks it again.
//
// Rule of thumb for every field: copy what is PRINTED on the paper.
// If something is missing or unreadable, leave it out (null in the app). Never guess.

import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const LineItem = z.object({
  sku: z.string().nullable().describe("Supplier item number / SKU exactly as printed. Leave out if the line has none."),
  description: z.string().describe("Item description as printed."),
  quantity: z
    .number()
    .nullable()
    .describe(
      "Quantity shipped or billed on this line, in the unit printed on the line. If a person crossed out a number and wrote a new one, use the new handwritten number.",
    ),
  unit: z
    .string()
    .nullable()
    .describe('Unit of measure as printed, for example "EA", "CS", "BX", "LB". Leave out if none.'),
  pack_size: z
    .number()
    .nullable()
    .describe('Units inside one pack when printed, for example 24 for "CS/24" or "24/CS". Leave out if not printed.'),
  quantity_backordered: z
    .number()
    .nullable()
    .describe("Quantity the supplier says is back-ordered or to follow. Leave out if not printed."),
  unit_price: z.number().nullable().describe("Price per unit as printed. Leave out on packing slips with no prices."),
  line_total: z
    .number()
    .nullable()
    .describe("Line amount as printed. Copy it even if it looks wrong; do not recalculate."),
  confidence: Confidence.describe(
    "How sure you are that this line was read correctly. Use low for blurry, cut-off or hand-corrected text.",
  ),
  note: z
    .string()
    .nullable()
    .describe(
      "Short note about anything unusual on this line (hand correction, smudge, substitution). Leave out if nothing.",
    ),
});
export type LineItem = z.infer<typeof LineItem>;

export const Extraction = z.object({
  document_type: z.enum(["packing_slip", "invoice", "other"]),
  language: z.enum(["en", "es", "mixed"]).describe("Main language the document is printed in."),
  supplier_name: z.string().nullable(),
  document_number: z.string().nullable().describe("Invoice number or packing slip number, exactly as printed."),
  document_date: z
    .string()
    .nullable()
    .describe("Date of the document written as YYYY-MM-DD, whatever format it is printed in."),
  po_number: z.string().nullable().describe("The buyer's purchase order number if printed."),
  currency: z.string().nullable().describe('ISO code such as "USD" when it can be told from the document.'),
  line_items: z.array(LineItem),
  subtotal: z.number().nullable(),
  tax: z.number().nullable().describe("Sales tax amount (for example IVU in Puerto Rico)."),
  shipping: z.number().nullable().describe("Freight, delivery or shipping charge."),
  discount: z.number().nullable().describe("Discount amount as a positive number."),
  total: z.number().nullable().describe("Amount due / invoice total as printed."),
  warnings: z
    .array(z.string())
    .describe(
      "Anything a receiving clerk should know: unreadable parts, pages that seem missing, totals you could not read.",
    ),
});
export type Extraction = z.infer<typeof Extraction>;

/** Copy of an object schema where every `.nullable()` field becomes `.optional()` (descriptions kept). */
function optionalInsteadOfNull(schema: z.ZodObject): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    if (field instanceof z.ZodNullable) {
      const inner = field.unwrap() as z.ZodType;
      shape[key] = (field.description ? inner.describe(field.description) : inner).optional();
    } else if (field instanceof z.ZodArray && field.element instanceof z.ZodObject) {
      const list = z.array(optionalInsteadOfNull(field.element));
      shape[key] = field.description ? list.describe(field.description) : list;
    } else {
      shape[key] = field;
    }
  }
  return z.object(shape);
}

/** Fill in null for every nullable field that is missing, including inside line items. */
function fillNulls(value: unknown, schema: z.ZodObject): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    if (field instanceof z.ZodNullable && out[key] === undefined) out[key] = null;
    else if (field instanceof z.ZodArray && field.element instanceof z.ZodObject && Array.isArray(out[key])) {
      const element = field.element;
      out[key] = (out[key] as unknown[]).map((item) => fillNulls(item, element));
    }
  }
  return out;
}

/** The schema sent to the Claude API (see the note at the top of this file). */
export const ExtractionForApi = optionalInsteadOfNull(Extraction);

/** Turn the API's answer into an `Extraction`: missing fields become null, then check it. */
export function fromApi(answer: unknown): Extraction {
  return Extraction.parse(fillNulls(answer, Extraction));
}

/** A purchase order: what the store ordered. Comes from the buyer's own system, not from the AI. */
export const PurchaseOrder = z.object({
  po_number: z.string(),
  supplier_name: z.string(),
  order_date: z.string(),
  lines: z.array(
    z.object({
      sku: z.string(),
      description: z.string(),
      quantity_ordered: z.number(),
      unit: z.string(),
      unit_price: z.number().nullable(),
    }),
  ),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrder>;
