import type { Extraction, LineItem, PurchaseOrder } from "../src/shared/schema";

export function line(over: Partial<LineItem> = {}): LineItem {
  return {
    sku: "A-1",
    description: "Widget",
    quantity: 2,
    unit: "EA",
    pack_size: null,
    quantity_backordered: null,
    unit_price: 5,
    line_total: 10,
    confidence: "high",
    note: null,
    ...over,
  };
}

export function doc(over: Partial<Extraction> = {}): Extraction {
  return {
    document_type: "invoice",
    language: "en",
    supplier_name: "Acme Supply",
    document_number: "INV-1",
    document_date: "2026-10-01",
    po_number: "PO-1",
    currency: "USD",
    line_items: [line()],
    subtotal: 10,
    tax: null,
    shipping: null,
    discount: null,
    total: 10,
    warnings: [],
    ...over,
  };
}

export function po(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    po_number: "PO-1",
    supplier_name: "Acme Supply",
    order_date: "2026-09-25",
    lines: [{ sku: "A-1", description: "Widget", quantity_ordered: 2, unit: "EA", unit_price: 5 }],
    ...over,
  };
}
