// The shape of the data we want back from a packing slip or invoice.
//
// `Extraction` is the shape the rest of the app uses. A field the paper does not
// show is null. It also gives TypeScript the `Extraction` type used everywhere.
//
// The Claude API gets a simpler copy, `ExtractionForApi`. Structured outputs turn
// the schema into a grammar, and every "can be null" or "optional" field roughly
// doubles part of that grammar. With 18 such fields the API refused it ("Schema is
// too complex"). So in the API copy EVERY field is required and is plain text:
// an empty string "" means "not printed", and numbers come back as text such as
// "1234.50". `fromApi()` turns that back into an `Extraction` (empty -> null,
// text -> number) and checks it again with Zod.
//
// Rule of thumb for every field: copy what is PRINTED on the paper.
// If something is missing or unreadable, leave it empty (null in the app). Never guess.

import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const LineItem = z.object({
  sku: z.string().nullable().describe("Supplier item number / SKU exactly as printed."),
  description: z.string().describe("Item description as printed."),
  quantity: z
    .number()
    .nullable()
    .describe(
      "Quantity shipped or billed on this line, in the unit printed on the line. If a person crossed out a number and wrote a new one, use the new handwritten number.",
    ),
  unit: z.string().nullable().describe('Unit of measure as printed, for example "EA", "CS", "BX", "LB".'),
  pack_size: z
    .number()
    .nullable()
    .describe('Units inside one pack when printed, for example 24 for "CS/24" or "24/CS".'),
  quantity_backordered: z.number().nullable().describe("Quantity the supplier says is back-ordered or to follow."),
  unit_price: z.number().nullable().describe("Price per unit as printed. Packing slips often have none."),
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
    .describe("Short note about anything unusual on this line (hand correction, smudge, substitution)."),
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

const EMPTY_TEXT = 'Use "" (empty) if it is not printed or cannot be read.';
const NUMBER_TEXT =
  'Write it as a plain number with a dot for decimals and no currency sign or thousands separator, for example "1234.50". ' +
  EMPTY_TEXT;

/** API copy of an object schema: every `.nullable()` field becomes a required string (see the note at the top). */
function requiredText(schema: z.ZodObject): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    if (field instanceof z.ZodNullable) {
      const hint = field.unwrap() instanceof z.ZodNumber ? NUMBER_TEXT : EMPTY_TEXT;
      shape[key] = z.string().describe(field.description ? `${field.description} ${hint}` : hint);
    } else if (field instanceof z.ZodArray && field.element instanceof z.ZodObject) {
      const list = z.array(requiredText(field.element));
      shape[key] = field.description ? list.describe(field.description) : list;
    } else {
      shape[key] = field;
    }
  }
  return z.object(shape);
}

/** The schema sent to the Claude API (see the note at the top of this file). */
export const ExtractionForApi = requiredText(Extraction);

/**
 * Read a number the model wrote as text. Returns null for "" and undefined when it cannot be read.
 * Tolerates "$1,234.50", "1.234,50" (Spanish style) and "12,5".
 */
export function parseAmount(text: string): number | null | undefined {
  let t = text.trim().replace(/[$€\s]|USD/gi, "");
  if (t === "") return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith("-");
  t = t.replace(/[()\-]/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(t)) return undefined;
  const n = Number(t);
  return negative ? -n : n;
}

/** Turn API text fields back into the app's shape: "" -> null, number text -> number. */
function fromText(value: unknown, schema: z.ZodObject, where: string, warnings: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    const v = out[key];
    if (field instanceof z.ZodNullable) {
      if (v === undefined || v === null) out[key] = null;
      else if (typeof v === "string") {
        if (field.unwrap() instanceof z.ZodNumber) {
          const n = parseAmount(v);
          if (n === undefined) warnings.push(`Could not read the number "${v}" for ${where}${key}; left it empty.`);
          out[key] = n ?? null;
        } else {
          out[key] = v.trim() === "" ? null : v.trim();
        }
      }
    } else if (field instanceof z.ZodArray && field.element instanceof z.ZodObject && Array.isArray(v)) {
      const element = field.element;
      out[key] = v.map((item, i) => fromText(item, element, `line ${i + 1} `, warnings));
    }
  }
  return out;
}

/** Turn the API's answer into an `Extraction` and check it. Also accepts an answer already in app shape. */
export function fromApi(answer: unknown): Extraction {
  const extra: string[] = [];
  const converted = fromText(answer, Extraction, "", extra) as Record<string, unknown> | undefined;
  if (converted && typeof converted === "object" && extra.length) {
    converted.warnings = [...((converted.warnings as string[] | undefined) ?? []), ...extra];
  }
  return Extraction.parse(converted);
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
