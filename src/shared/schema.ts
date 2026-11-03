// The shape of the data we want back from a packing slip or invoice.
//
// This one Zod schema does three jobs:
//   1. It is sent to the Claude API as the required output format
//      (structured outputs), so the model must answer in exactly this shape.
//   2. It checks the answer again on our side before we trust it.
//   3. It gives TypeScript the `Extraction` type used everywhere else.
//
// Rule of thumb for every field: copy what is PRINTED on the paper.
// If something is missing or unreadable, use null. Never guess.

import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const LineItem = z.object({
  sku: z.string().nullable().describe("Supplier item number / SKU exactly as printed. null if the line has none."),
  description: z.string().describe("Item description as printed."),
  quantity: z
    .number()
    .nullable()
    .describe(
      "Quantity shipped or billed on this line, in the unit printed on the line. If a person crossed out a number and wrote a new one, use the new handwritten number.",
    ),
  unit: z.string().nullable().describe('Unit of measure as printed, for example "EA", "CS", "BX", "LB". null if none.'),
  pack_size: z
    .number()
    .nullable()
    .describe('Units inside one pack when printed, for example 24 for "CS/24" or "24/CS". null if not printed.'),
  quantity_backordered: z
    .number()
    .nullable()
    .describe("Quantity the supplier says is back-ordered or to follow. null if not printed."),
  unit_price: z.number().nullable().describe("Price per unit as printed. null on packing slips with no prices."),
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
      "Short note about anything unusual on this line (hand correction, smudge, substitution). null if nothing.",
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
