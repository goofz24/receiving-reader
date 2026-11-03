// Turns one Sample (samples/data.ts) into its answer key, its purchase order
// and the HTML that gets printed to PDF or "photographed".
// No files and no browser here, so this part is easy to unit test.

import type { Extraction, LineItem, PurchaseOrder } from "../src/shared/schema";
import { BUYER, type Sample, type SampleLine } from "./data";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotal(l: SampleLine): number | null {
  if (l.unit_price === undefined) return null;
  return l.printed_total ?? round2(l.quantity * l.unit_price);
}

export interface Totals {
  subtotal: number | null;
  discount: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
}

export function totals(s: Sample): Totals {
  if (s.document_type !== "invoice") return { subtotal: null, discount: null, shipping: null, tax: null, total: null };
  const sum = round2(s.lines.reduce((a, l) => a + (lineTotal(l) ?? 0), 0));
  const subtotal = s.printed_subtotal ?? sum;
  const discount = s.discount ?? null;
  const shipping = s.shipping ?? null;
  const tax = s.tax_rate !== undefined ? round2(subtotal * s.tax_rate) : null;
  const total = round2(subtotal + (tax ?? 0) + (shipping ?? 0) - (discount ?? 0));
  return { subtotal, discount, shipping, tax, total };
}

const hasBackorderColumn = (s: Sample) => s.lines.some((l) => l.backordered !== undefined);

/** The answer key: what a perfect reader would return for this document. */
export function answerKey(s: Sample): Extraction {
  const t = totals(s);
  const showBo = hasBackorderColumn(s);
  const line_items: LineItem[] = s.lines.map((l) => ({
    sku: l.sku,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    pack_size: l.pack_size ?? null,
    quantity_backordered: showBo ? (l.backordered ?? 0) : null,
    unit_price: l.unit_price ?? null,
    line_total: lineTotal(l),
    confidence: l.crossed_out !== undefined ? "low" : "high",
    note: null,
  }));
  return {
    document_type: s.document_type,
    language: s.language,
    supplier_name: s.supplier.name,
    document_number: s.number,
    document_date: s.date_iso,
    po_number: s.po_printed,
    currency: s.document_type === "invoice" ? "USD" : null,
    line_items,
    ...t,
    warnings: [],
  };
}

/** What the store ordered, as it would come out of the store's own system. */
export function purchaseOrder(s: Sample): PurchaseOrder | null {
  if (s.has_po === false || s.po_printed === null) return null;
  const seen = new Set<string>();
  const lines: PurchaseOrder["lines"] = [];
  for (const l of s.lines) {
    const sku = l.po_sku ?? l.sku;
    if (sku === null || seen.has(sku)) continue;
    seen.add(sku);
    lines.push({
      sku,
      description: l.po_description ?? l.description,
      quantity_ordered: l.po_quantity ?? l.ordered ?? l.quantity,
      unit: l.po_unit ?? l.unit ?? "EA",
      unit_price: l.po_unit_price ?? l.unit_price ?? null,
    });
  }
  return {
    po_number: s.po_system ?? s.po_printed,
    supplier_name: s.supplier.name,
    order_date: s.date_iso,
    lines,
  };
}

// ---------- HTML ----------

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toFixed(2));
const usd = (n: number | null | undefined) => (n === null || n === undefined ? "" : `$${n.toFixed(2)}`);

const L = {
  en: {
    invoice: "INVOICE",
    packing_slip: "PACKING SLIP",
    number: { invoice: "Invoice #", packing_slip: "Packing Slip #" },
    date: "Date",
    po: "Customer PO",
    shipTo: "Ship To",
    billTo: "Bill To",
    item: "Item #",
    desc: "Description",
    qty: "Qty",
    ordered: "Ordered",
    shipped: "Shipped",
    bo: "B/O",
    unit: "U/M",
    pack: "Pack",
    price: "Unit Price",
    amount: "Amount",
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Freight",
    total: "TOTAL DUE",
    terms: "Terms: Net 30",
    received: "Received by: ____________________",
  },
  es: {
    invoice: "FACTURA",
    packing_slip: "CONDUCE",
    number: { invoice: "Factura Núm.", packing_slip: "Conduce Núm." },
    date: "Fecha",
    po: "Orden de Compra",
    shipTo: "Enviar a",
    billTo: "Facturar a",
    item: "Código",
    desc: "Descripción",
    qty: "Cant.",
    ordered: "Pedido",
    shipped: "Enviado",
    bo: "Pend.",
    unit: "Unidad",
    pack: "Empaque",
    price: "Precio Unit.",
    amount: "Importe",
    subtotal: "Subtotal",
    discount: "Descuento",
    shipping: "Flete",
    total: "TOTAL A PAGAR",
    terms: "Términos: 30 días",
    received: "Recibido por: ____________________",
  },
};

function qtyCell(l: SampleLine): string {
  if (l.crossed_out === undefined) return esc(l.quantity);
  return `<span class="crossed">${esc(l.crossed_out)}</span><span class="hand">${esc(l.quantity)}</span>`;
}

function descCell(l: SampleLine): string {
  return esc(l.description) + (l.remark ? `<div class="remark">${esc(l.remark)}</div>` : "");
}

function itemTable(s: Sample): string {
  const t = L[s.language];
  const slip = s.document_type === "packing_slip";
  const showOrdered = slip && s.lines.some((l) => l.ordered !== undefined);
  const showBo = hasBackorderColumn(s);
  const showPack = s.lines.some((l) => l.pack_size !== undefined) && s.template !== "factura";
  const showSku = s.lines.some((l) => l.sku !== null);

  const head = [
    showSku ? `<th>${t.item}</th>` : "",
    `<th class="wide">${t.desc}</th>`,
    showOrdered ? `<th class="n">${t.ordered}</th>` : "",
    `<th class="n">${showOrdered ? t.shipped : t.qty}</th>`,
    showBo ? `<th class="n">${t.bo}</th>` : "",
    `<th>${t.unit}</th>`,
    showPack ? `<th>${t.pack}</th>` : "",
    slip ? "" : `<th class="n">${t.price}</th><th class="n">${t.amount}</th>`,
  ].join("");

  const rows = s.lines
    .map(
      (l) =>
        `<tr>${[
          showSku ? `<td class="sku">${esc(l.sku)}</td>` : "",
          `<td class="wide">${descCell(l)}</td>`,
          showOrdered ? `<td class="n">${esc(l.ordered)}</td>` : "",
          `<td class="n">${qtyCell(l)}</td>`,
          showBo ? `<td class="n">${esc(l.backordered ?? 0)}</td>` : "",
          `<td>${esc(l.unit)}</td>`,
          showPack ? `<td>${l.pack_size ? `${l.pack_size}/${esc(l.unit)}` : ""}</td>` : "",
          slip ? "" : `<td class="n">${fmt(l.unit_price)}</td><td class="n">${fmt(lineTotal(l))}</td>`,
        ].join("")}</tr>`,
    )
    .join("\n");

  return `<table class="items"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function totalsBlock(s: Sample): string {
  if (s.document_type !== "invoice") return "";
  const t = L[s.language];
  const v = totals(s);
  const row = (label: string, value: number | null, cls = "") =>
    value === null ? "" : `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${usd(value)}</td></tr>`;
  return `<table class="totals">
    ${row(t.subtotal, v.subtotal)}
    ${v.discount !== null ? `<tr><td>${t.discount}</td><td class="n">-${usd(v.discount)}</td></tr>` : ""}
    ${row(t.shipping, v.shipping)}
    ${row(s.tax_label ?? "Tax", v.tax)}
    ${row(t.total, v.total, "grand")}
  </table>`;
}

const STYLES: Record<Sample["template"], string> = {
  classic: `
    body { font-family: "Liberation Serif", "DejaVu Serif", serif; font-size: 12.5px; }
    .top { display:flex; justify-content:space-between; border-bottom: 3px double #222; padding-bottom: 10px; }
    .doc-title { font-size: 26px; letter-spacing: 3px; }
    table.items th { border: 1px solid #222; background:#e9e9e9; padding: 4px 6px; }
    table.items td { border: 1px solid #222; padding: 4px 6px; }`,
  modern: `
    body { font-family: Inter, "DejaVu Sans", sans-serif; font-size: 12px; color:#1d2433; }
    .top { display:flex; justify-content:space-between; background:#16425b; color:#fff; padding: 16px 18px; border-radius: 6px; }
    .top .muted { color:#cfe0ea; }
    .doc-title { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
    table.items th { background:#d9e7ef; text-align:left; padding: 7px 8px; font-weight:600; }
    table.items td { border-bottom: 1px solid #d5dbe1; padding: 7px 8px; }`,
  printout: `
    body { font-family: "Courier 10 Pitch", "Liberation Mono", monospace; font-size: 12px; text-transform: uppercase; }
    .top { display:flex; justify-content:space-between; border-bottom: 1px dashed #333; padding-bottom: 8px; }
    .doc-title { font-size: 20px; font-weight: bold; }
    table.items th { border-bottom: 1px dashed #333; text-align:left; padding: 3px 5px; }
    table.items tbody tr:nth-child(odd) td { background: #e3f1e3; }
    table.items td { padding: 4px 5px; }`,
  factura: `
    body { font-family: Carlito, "Liberation Sans", sans-serif; font-size: 13px; }
    .top { display:flex; justify-content:space-between; border: 2px solid #7a1f1f; padding: 12px; border-radius: 4px; }
    .doc-title { font-size: 24px; color:#7a1f1f; font-weight:bold; }
    table.items th { background:#7a1f1f; color:#fff; padding: 5px 7px; text-align:left; }
    table.items td { border-bottom: 1px solid #c9b3b3; padding: 5px 7px; }`,
  handwritten: `
    body { font-family: "Liberation Sans", sans-serif; font-size: 13px; background: #fbfaf2; }
    .top { display:flex; justify-content:space-between; border-bottom: 2px solid #2a4d8f; padding-bottom: 8px; color:#2a4d8f; }
    .doc-title { font-size: 20px; font-weight:bold; }
    table.items th { color:#2a4d8f; border-bottom: 2px solid #2a4d8f; text-align:left; padding: 5px; }
    table.items td { border-bottom: 1px solid #9fb6dd; padding: 7px 5px; font-family: Caveat, cursive; font-size: 22px; color:#1b2a8a; }
    table.totals td.n, .fill { font-family: Caveat, cursive; font-size: 22px; color:#1b2a8a; }`,
};

export function renderHtml(s: Sample, fontCss: string): string {
  const t = L[s.language];
  const fill = (v: string | null) => (s.template === "handwritten" ? `<span class="fill">${esc(v)}</span>` : esc(v));
  return `<!doctype html><html lang="${s.language}"><head><meta charset="utf-8"><style>
  ${fontCss}
  @page { size: Letter; margin: 0.55in; }
  * { box-sizing: border-box; }
  td { vertical-align: top; }
  body { margin: 0; }
  .page { width: 100%; }
  .muted { color: #555; }
  .meta { margin-top: 14px; display:flex; justify-content:space-between; gap: 24px; }
  .meta table td { padding: 1px 8px 1px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 18px; }
  table.items thead { display: table-header-group; }
  table.items tr { break-inside: avoid; }
  .n { text-align: right; }
  .wide { width: 42%; }
  .remark { font-size: 0.85em; color: #333; font-style: italic; }
  table.totals { margin-left: auto; margin-top: 14px; border-collapse: collapse; min-width: 260px; }
  table.totals td { padding: 3px 8px; }
  table.totals tr.grand td { font-weight: bold; border-top: 2px solid #222; font-size: 1.1em; }
  .crossed { position: relative; margin-right: 6px; color: #444; }
  .crossed::after { content:""; position:absolute; left:-4px; right:-4px; top:48%; border-top: 3px solid #1b2a8a; transform: rotate(-16deg); }
  .hand { font-family: Caveat, cursive; font-size: 30px; font-weight: 700; color: #1b2a8a; line-height: 0.8; }
  .foot { margin-top: 28px; display:flex; justify-content:space-between; font-size: 0.92em; }
  .sample-note { margin-top: 18px; font-size: 9px; color: #888; text-align:center; text-transform:none; }
  ${STYLES[s.template]}
  </style></head><body><div class="page">
  <div class="top">
    <div><div style="font-size:1.35em;font-weight:bold">${esc(s.supplier.name)}</div>
      <div class="muted">${s.supplier.address.map(esc).join("<br>")}<br>${esc(s.supplier.phone)}</div></div>
    <div style="text-align:right"><div class="doc-title">${t[s.document_type]}</div>
      <table style="margin-left:auto"><tr><td>${t.number[s.document_type]}</td><td><b>${fill(s.number)}</b></td></tr>
      <tr><td>${t.date}</td><td>${fill(s.date_printed)}</td></tr>
      ${s.po_printed !== null ? `<tr><td>${t.po}</td><td>${s.template === "printout" && s.po_system ? "PO# " : ""}${esc(s.po_printed)}</td></tr>` : ""}
      </table></div>
  </div>
  <div class="meta">
    <div><b>${s.document_type === "invoice" ? t.billTo : t.shipTo}</b><br>${esc(BUYER.name)}<br>${BUYER.address.map(esc).join("<br>")}</div>
    <div class="muted">${s.document_type === "invoice" ? t.terms : ""}</div>
  </div>
  ${itemTable(s)}
  ${totalsBlock(s)}
  <div class="foot"><div>${t.received}</div></div>
  <div class="sample-note">Fictional sample document for software testing. All names, numbers and prices are made up.</div>
  </div></body></html>`;
}
