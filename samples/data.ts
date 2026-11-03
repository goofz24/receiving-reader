// The made-up documents in the test set, written as data.
//
// Every company, address, item and price here is FICTIONAL. Nothing comes from
// a real employer, supplier or customer. `npm run samples` turns this file into:
//   samples/documents/*.pdf|jpg   what the reader sees
//   samples/answers/*.json        the answer key for each document
//   samples/purchase-orders/*.json what the store ordered
//
// Because the document AND its answer key are both made from the same data,
// the answer key always matches what is printed on the paper.
//
// Each sample says what it tests and which problems the checks must catch.

import type { FlagCode } from "../src/shared/checks";

export type Template = "classic" | "modern" | "printout" | "factura" | "handwritten";

export interface SampleLine {
  sku: string | null;
  description: string;
  /** Shipped (packing slip) or billed (invoice). This is the answer key's `quantity`. */
  quantity: number;
  unit: string | null;
  /** Printed pack size, e.g. 12 for "12/CS". Only set when it is printed. */
  pack_size?: number;
  /** Ordered quantity printed on packing slips (supplier's copy). */
  ordered?: number;
  backordered?: number;
  unit_price?: number;
  /** Override the printed line total (to plant a math error). */
  printed_total?: number;
  /** A printed number crossed out by hand; `quantity` is the handwritten one. */
  crossed_out?: number;
  /** Small print under the description, e.g. "SUB for 31-200". */
  remark?: string;
  /** What the store ordered on the PO for this SKU, when different from `quantity`. */
  po_quantity?: number;
  po_unit?: string;
  po_unit_price?: number;
  /** The SKU the store actually ordered, when the supplier substituted a different item. */
  po_sku?: string;
  po_description?: string;
}

export interface Supplier {
  name: string;
  address: string[];
  phone: string;
}

export interface Sample {
  id: string;
  title: string;
  tests: string;
  template: Template;
  output: "pdf" | "photo";
  photo?: { rotate: number; blur: number; quality: number; scale: number };
  document_type: "packing_slip" | "invoice";
  language: "en" | "es";
  supplier: Supplier;
  number: string;
  date_printed: string;
  date_iso: string;
  /** PO number as printed (null = not printed). */
  po_printed: string | null;
  /** PO number as stored in the store's system (can be formatted differently). */
  po_system?: string;
  /** false = the store has no PO for this delivery. */
  has_po?: boolean;
  lines: SampleLine[];
  discount?: number;
  shipping?: number;
  /** Tax rate; tax amount printed is round(subtotal * rate). */
  tax_rate?: number;
  tax_label?: string;
  /** Override the printed subtotal (to plant an error). */
  printed_subtotal?: number;
  expected_flags: FlagCode[];
}

export const BUYER = {
  name: "Demo Retail Co. - Store 12",
  address: ["Receiving Dock B", "100 Calle Ficticia", "Ponce, PR 00700"],
};

const HARBORLINE: Supplier = {
  name: "Harborline Janitorial Supply",
  address: ["4410 Dockside Ave, Unit 7", "Jacksonville, FL 32200"],
  phone: "(904) 555-0142",
};
const TRIPOINT: Supplier = {
  name: "Tri-Point Hardware Distributors",
  address: ["88 Foundry Row", "Atlanta, GA 30300"],
  phone: "(404) 555-0177",
};
const CEIBA: Supplier = {
  name: "Distribuidora La Ceiba",
  address: ["Carr. 1 Km 99.9, Bo. Ejemplo", "Caguas, PR 00720"],
  phone: "(787) 555-0119",
};
const BLUEWATER: Supplier = {
  name: "Bluewater Paper & Packaging",
  address: ["2300 NW Sample Pkwy", "Miami, FL 33100"],
  phone: "(305) 555-0164",
};
const SUMMIT: Supplier = {
  name: "Summit Snack Wholesale",
  address: ["17 Orchard Industrial Ct", "Orlando, FL 32800"],
  phone: "(407) 555-0108",
};
const COASTAL: Supplier = {
  name: "Coastal Electric Parts",
  address: ["950 Breaker St", "Tampa, FL 33600"],
  phone: "(813) 555-0131",
};
const LOSPINOS: Supplier = {
  name: "Finca Los Pinos",
  address: ["Bo. Montaña, Adjuntas PR"],
  phone: "787-555-0150",
};

const SNACKS: SampleLine[] = [
  { sku: "SN-1001", description: "Plantain Chips Lightly Salted 5oz", quantity: 12, unit: "CS", unit_price: 18.5 },
  { sku: "SN-1002", description: "Plantain Chips Garlic 5oz", quantity: 8, unit: "CS", unit_price: 18.5 },
  { sku: "SN-1140", description: "Guava Pastry Bites 8oz", quantity: 6, unit: "CS", unit_price: 26.4 },
  { sku: "SN-1205", description: "Roasted Peanuts Salted 6oz", quantity: 10, unit: "CS", unit_price: 15.75 },
  { sku: "SN-1310", description: "Coconut Candy Bars", quantity: 4, unit: "CS", unit_price: 21.0 },
  { sku: "SN-1402", description: "Cheese Puffs Family Size", quantity: 9, unit: "CS", unit_price: 23.9 },
  { sku: "SN-1403", description: "Cheese Puffs Snack Size", quantity: 5, unit: "CS", unit_price: 19.6 },
  { sku: "SN-1520", description: "Trail Mix Tropical", quantity: 3, unit: "CS", unit_price: 31.2 },
  { sku: "SN-1601", description: "Butter Cookies Tin", quantity: 4, unit: "CS", unit_price: 28.8 },
  { sku: "SN-1602", description: "Vanilla Wafers", quantity: 7, unit: "CS", unit_price: 16.45 },
  { sku: "SN-1710", description: "Mango Fruit Leather", quantity: 5, unit: "CS", unit_price: 22.1 },
  { sku: "SN-1711", description: "Pineapple Fruit Leather", quantity: 5, unit: "CS", unit_price: 22.1 },
  { sku: "SN-1805", description: "Sesame Sticks Honey", quantity: 2, unit: "CS", unit_price: 17.3 },
  { sku: "SN-1902", description: "Pretzel Rods Classic", quantity: 6, unit: "CS", unit_price: 14.95 },
  { sku: "SN-2001", description: "Popcorn Kettle Corn", quantity: 8, unit: "CS", unit_price: 19.2 },
  { sku: "SN-2002", description: "Popcorn White Cheddar", quantity: 8, unit: "CS", unit_price: 19.2 },
  { sku: "SN-2110", description: "Rice Crackers Seaweed", quantity: 3, unit: "CS", unit_price: 24.6 },
  { sku: "SN-2205", description: "Granola Bars Oat Honey", quantity: 10, unit: "CS", unit_price: 20.4 },
  { sku: "SN-2206", description: "Granola Bars Chocolate Chip", quantity: 10, unit: "CS", unit_price: 20.4 },
  { sku: "SN-2301", description: "Beef Jerky Original", quantity: 2, unit: "CS", unit_price: 54.0 },
  { sku: "SN-2302", description: "Beef Jerky Teriyaki", quantity: 2, unit: "CS", unit_price: 54.0 },
  { sku: "SN-2410", description: "Mixed Nuts Deluxe", quantity: 3, unit: "CS", unit_price: 48.75 },
  { sku: "SN-2505", description: "Sunflower Seeds Ranch", quantity: 6, unit: "CS", unit_price: 13.8 },
  { sku: "SN-2506", description: "Sunflower Seeds Original", quantity: 6, unit: "CS", unit_price: 13.8 },
  { sku: "SN-2620", description: "Animal Crackers Bulk", quantity: 4, unit: "CS", unit_price: 18.9 },
  { sku: "SN-2701", description: "Corn Nuts Chile Picante", quantity: 5, unit: "CS", unit_price: 15.4 },
  { sku: "SN-2802", description: "Dried Pineapple Rings", quantity: 3, unit: "CS", unit_price: 33.6 },
  { sku: "SN-2903", description: "Chocolate Covered Almonds", quantity: 2, unit: "CS", unit_price: 41.25 },
];

export const SAMPLES: Sample[] = [
  {
    id: "01-invoice-basic",
    title: "Simple invoice",
    tests: "A clean, typed invoice that matches its PO. The easy baseline.",
    template: "classic",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: HARBORLINE,
    number: "INV-208841",
    date_printed: "10/14/2026",
    date_iso: "2026-10-14",
    po_printed: "PO-11042",
    lines: [
      { sku: "HJ-4410", description: "Trash Can Liners 33 Gal Black", quantity: 6, unit: "CS", unit_price: 38.4 },
      {
        sku: "HJ-2201",
        description: "All-Purpose Cleaner Concentrate 1 Gal",
        quantity: 12,
        unit: "EA",
        unit_price: 9.85,
      },
      { sku: "HJ-3105", description: "Microfiber Cloths Blue", quantity: 10, unit: "PK", unit_price: 7.2 },
      { sku: "HJ-0870", description: "Nitrile Gloves Large", quantity: 8, unit: "BX", unit_price: 11.95 },
      { sku: "HJ-5512", description: "Floor Mop Head Cotton #24", quantity: 4, unit: "EA", unit_price: 6.5 },
    ],
    expected_flags: [],
  },
  {
    id: "02-packing-slip-basic",
    title: "Simple packing slip",
    tests: "Packing slip with no prices. Ordered and shipped columns agree.",
    template: "modern",
    output: "pdf",
    document_type: "packing_slip",
    language: "en",
    supplier: TRIPOINT,
    number: "PS-55120",
    date_printed: "October 16, 2026",
    date_iso: "2026-10-16",
    po_printed: "PO-11051",
    lines: [
      { sku: "TP-10-332", description: 'Wood Screws #8 x 1-1/4"', quantity: 20, ordered: 20, unit: "BX" },
      { sku: "TP-22-108", description: "Duct Tape Silver 2in", quantity: 24, ordered: 24, unit: "EA" },
      { sku: "TP-41-900", description: "Extension Cord 25ft Outdoor", quantity: 6, ordered: 6, unit: "EA" },
      { sku: "TP-07-215", description: "Utility Knife Retractable", quantity: 12, ordered: 12, unit: "EA" },
    ],
    expected_flags: [],
  },
  {
    id: "03-invoice-discount-freight-tax",
    title: "Invoice with discount, freight and tax",
    tests: "Totals block with four parts. Reader must put each amount in the right field.",
    template: "modern",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: BLUEWATER,
    number: "BW-0093317",
    date_printed: "2026-10-09",
    date_iso: "2026-10-09",
    po_printed: "PO-11033",
    lines: [
      { sku: "BW-PT-800", description: "Paper Towel Rolls Kitchen", quantity: 10, unit: "CS", unit_price: 32.9 },
      { sku: "BW-TT-450", description: "Toilet Tissue 2-Ply", quantity: 12, unit: "CS", unit_price: 41.5 },
      { sku: "BW-BG-120", description: "Kraft Grocery Bags #12", quantity: 5, unit: "BDL", unit_price: 27.0 },
      { sku: "BW-NP-300", description: "Dinner Napkins White", quantity: 6, unit: "CS", unit_price: 24.75 },
    ],
    discount: 22.6,
    shipping: 45.0,
    tax_rate: 0.07,
    tax_label: "Sales Tax 7%",
    expected_flags: [],
  },
  {
    id: "04-invoice-line-math-error",
    title: "Invoice with a wrong line total",
    tests: "Supplier typo: 12 x $18.50 printed as $228.00. Reader must copy it, code must catch it.",
    template: "classic",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: SUMMIT,
    number: "SSW-77120",
    date_printed: "10/20/2026",
    date_iso: "2026-10-20",
    po_printed: "PO-11060",
    lines: [{ ...SNACKS[0], printed_total: 228.0 }, SNACKS[1], SNACKS[2], SNACKS[3]],
    expected_flags: ["line_math"],
  },
  {
    id: "05-invoice-subtotal-error",
    title: "Invoice whose subtotal is wrong",
    tests: "Lines are right but the subtotal is $10 too high. Code must catch it.",
    template: "printout",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: COASTAL,
    number: "448120",
    date_printed: "10/21/26",
    date_iso: "2026-10-21",
    po_printed: "PO-11064",
    lines: [
      { sku: "CE-BRK-20", description: "CIRCUIT BREAKER 20A 1P", quantity: 10, unit: "EA", unit_price: 8.75 },
      { sku: "CE-OUT-15W", description: "DUPLEX OUTLET 15A WHITE", quantity: 25, unit: "EA", unit_price: 1.89 },
      { sku: "CE-WN-YEL", description: "WIRE NUTS YELLOW", quantity: 4, unit: "BG", unit_price: 6.4 },
      { sku: "CE-LED-9W", description: "LED BULB A19 9W 5000K", quantity: 36, unit: "EA", unit_price: 2.15 },
    ],
    printed_subtotal: 247.75,
    expected_flags: ["subtotal_mismatch"],
  },
  {
    id: "06-packing-slip-backorder",
    title: "Packing slip with back-orders",
    tests: "Ordered / shipped / back-ordered columns. Reader must take shipped, not ordered.",
    template: "modern",
    output: "pdf",
    document_type: "packing_slip",
    language: "en",
    supplier: TRIPOINT,
    number: "PS-55187",
    date_printed: "October 22, 2026",
    date_iso: "2026-10-22",
    po_printed: "PO-11070",
    lines: [
      { sku: "TP-31-440", description: "Garden Hose 50ft", quantity: 6, ordered: 10, backordered: 4, unit: "EA" },
      { sku: "TP-12-010", description: "Work Gloves Leather L", quantity: 24, ordered: 24, unit: "PR" },
      { sku: "TP-55-702", description: "LED Flashlight AA", quantity: 0, ordered: 12, backordered: 12, unit: "EA" },
      { sku: "TP-18-330", description: "Zip Ties 8in Black", quantity: 15, ordered: 15, unit: "PK" },
    ],
    expected_flags: ["backordered"],
  },
  {
    id: "07-packing-slip-short",
    title: "Short-shipped packing slip",
    tests: "Supplier sent 18 of the 24 ordered with no back-order note. Must be flagged against the PO.",
    template: "classic",
    output: "pdf",
    document_type: "packing_slip",
    language: "en",
    supplier: HARBORLINE,
    number: "PKG-30951",
    date_printed: "10/23/2026",
    date_iso: "2026-10-23",
    po_printed: "PO-11072",
    lines: [
      {
        sku: "HJ-2201",
        description: "All-Purpose Cleaner Concentrate 1 Gal",
        quantity: 18,
        unit: "EA",
        po_quantity: 24,
      },
      { sku: "HJ-6620", description: "Glass Cleaner Spray 32oz", quantity: 24, unit: "EA" },
      { sku: "HJ-7301", description: "Wet Floor Sign Bilingual", quantity: 2, unit: "EA" },
    ],
    expected_flags: ["qty_short"],
  },
  {
    id: "08-factura-spanish",
    title: "Spanish invoice (factura) with IVU",
    tests: "Spanish labels, day/month date, cases with 'caja de 12', and IVU tax.",
    template: "factura",
    output: "pdf",
    document_type: "invoice",
    language: "es",
    supplier: CEIBA,
    number: "F-0012457",
    date_printed: "15/10/2026",
    date_iso: "2026-10-15",
    po_printed: "OC-11045",
    lines: [
      {
        sku: "LC-ARZ-03",
        description: "Arroz grano largo 3 lb, caja de 12",
        quantity: 10,
        unit: "CJ",
        pack_size: 12,
        unit_price: 21.6,
      },
      {
        sku: "LC-HBR-16",
        description: "Habichuelas rosadas 16 oz, caja de 24",
        quantity: 6,
        unit: "CJ",
        pack_size: 24,
        unit_price: 26.4,
      },
      {
        sku: "LC-ACE-48",
        description: "Aceite vegetal 48 oz, caja de 9",
        quantity: 4,
        unit: "CJ",
        pack_size: 9,
        unit_price: 36.0,
      },
      {
        sku: "LC-CAF-14",
        description: "Café molido 14 oz, caja de 12",
        quantity: 5,
        unit: "CJ",
        pack_size: 12,
        unit_price: 58.8,
      },
      {
        sku: "LC-SAL-26",
        description: "Sal yodada 26 oz, caja de 24",
        quantity: 2,
        unit: "CJ",
        pack_size: 24,
        unit_price: 16.8,
      },
    ],
    tax_rate: 0.115,
    tax_label: "IVU 11.5%",
    expected_flags: [],
  },
  {
    id: "09-invoice-two-pages",
    title: "Two-page invoice",
    tests: "28 lines that run onto a second page. Reader must not drop or repeat lines.",
    template: "classic",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: SUMMIT,
    number: "SSW-77188",
    date_printed: "10/27/2026",
    date_iso: "2026-10-27",
    po_printed: "PO-11081",
    lines: SNACKS,
    shipping: 85.0,
    expected_flags: [],
  },
  {
    id: "10-photo-packing-slip",
    title: "Phone photo of a packing slip",
    tests: "Same kind of slip as a crooked phone photo on a desk.",
    template: "modern",
    output: "photo",
    photo: { rotate: -2.5, blur: 0.4, quality: 72, scale: 1.4 },
    document_type: "packing_slip",
    language: "en",
    supplier: BLUEWATER,
    number: "BW-PS-40218",
    date_printed: "2026-10-24",
    date_iso: "2026-10-24",
    po_printed: "PO-11075",
    lines: [
      { sku: "BW-CUP-12", description: "Hot Cups 12oz Paper", quantity: 8, ordered: 8, unit: "CS" },
      { sku: "BW-LID-12", description: "Hot Cup Lids 12oz", quantity: 8, ordered: 8, unit: "CS" },
      { sku: "BW-STR-07", description: "Wrapped Straws 7.75in", quantity: 3, ordered: 3, unit: "CS" },
      { sku: "BW-CLM-96", description: "Clamshell Containers 9x6", quantity: 5, ordered: 5, unit: "CS" },
      { sku: "BW-FL-12", description: "Aluminum Foil Roll 12in", quantity: 6, ordered: 6, unit: "RL" },
    ],
    expected_flags: [],
  },
  {
    id: "11-photo-invoice-blurry",
    title: "Blurry phone photo of an invoice",
    tests: "Lower-quality photo, more tilt and blur. Tests how reading holds up on bad input.",
    template: "printout",
    output: "photo",
    photo: { rotate: 4, blur: 0.9, quality: 55, scale: 1.1 },
    document_type: "invoice",
    language: "en",
    supplier: COASTAL,
    number: "448377",
    date_printed: "10/28/26",
    date_iso: "2026-10-28",
    po_printed: "PO-11086",
    lines: [
      { sku: "CE-EXT-6", description: "POWER STRIP 6 OUTLET", quantity: 12, unit: "EA", unit_price: 7.95 },
      { sku: "CE-BAT-AA", description: "ALKALINE BATTERY AA", quantity: 20, unit: "PK", unit_price: 5.6 },
      { sku: "CE-BAT-9V", description: "ALKALINE BATTERY 9V", quantity: 10, unit: "PK", unit_price: 4.85 },
    ],
    tax_rate: 0.115,
    tax_label: "TAX",
    expected_flags: [],
  },
  {
    id: "12-invoice-cases-vs-each",
    title: "Invoice in cases, order in units",
    tests:
      "Billed in cases (12/CS), ordered in eaches: 3 CS = 36 EA. One line in boxes with no pack size must be counted by hand.",
    template: "classic",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: HARBORLINE,
    number: "INV-209310",
    date_printed: "10/29/2026",
    date_iso: "2026-10-29",
    po_printed: "PO-11090",
    lines: [
      {
        sku: "HJ-6620",
        description: "Glass Cleaner Spray 32oz",
        quantity: 3,
        unit: "CS",
        pack_size: 12,
        unit_price: 46.8,
        po_quantity: 36,
        po_unit: "EA",
        po_unit_price: 3.9,
      },
      {
        sku: "HJ-6702",
        description: "Disinfectant Wipes Canister",
        quantity: 4,
        unit: "CS",
        pack_size: 6,
        unit_price: 31.5,
        po_quantity: 24,
        po_unit: "EA",
        po_unit_price: 5.25,
      },
      {
        sku: "HJ-0870",
        description: "Nitrile Gloves Large",
        quantity: 5,
        unit: "BX",
        unit_price: 11.95,
        po_quantity: 500,
        po_unit: "EA",
        po_unit_price: 0.12,
      },
    ],
    expected_flags: ["unit_mismatch"],
  },
  {
    id: "13-packing-slip-hand-correction",
    title: "Packing slip with a hand correction",
    tests:
      "The 10 printed on one line is crossed out and 8 written by hand. Reader must use 8 and mark it low confidence.",
    template: "modern",
    output: "photo",
    photo: { rotate: 1.5, blur: 0.3, quality: 78, scale: 1.4 },
    document_type: "packing_slip",
    language: "en",
    supplier: TRIPOINT,
    number: "PS-55243",
    date_printed: "October 30, 2026",
    date_iso: "2026-10-30",
    po_printed: "PO-11093",
    lines: [
      {
        sku: "TP-60-115",
        description: "Paint Roller Kit 9in",
        quantity: 8,
        ordered: 10,
        crossed_out: 10,
        unit: "EA",
        po_quantity: 10,
      },
      { sku: "TP-60-220", description: "Painter's Tape Blue 1.88in", quantity: 24, ordered: 24, unit: "EA" },
      { sku: "TP-60-301", description: "Drop Cloth Canvas 9x12", quantity: 6, ordered: 6, unit: "EA" },
    ],
    expected_flags: ["qty_short", "low_confidence"],
  },
  {
    id: "14-packing-slip-substitution",
    title: "Packing slip with a substituted item",
    tests: "Supplier sent a different item number in place of one that was ordered.",
    template: "printout",
    output: "pdf",
    document_type: "packing_slip",
    language: "en",
    supplier: COASTAL,
    number: "PL-448402",
    date_printed: "10/30/26",
    date_iso: "2026-10-30",
    po_printed: "PO-11095",
    lines: [
      { sku: "CE-LED-9W", description: "LED BULB A19 9W 5000K", quantity: 24, ordered: 24, unit: "EA" },
      {
        sku: "CE-LED-11W",
        description: "LED BULB A19 11W 5000K",
        quantity: 24,
        ordered: 24,
        unit: "EA",
        remark: "SUB FOR CE-LED-10W (DISC)",
        po_sku: "CE-LED-10W",
        po_description: "LED BULB A19 10W 5000K",
      },
      { sku: "CE-SW-1P", description: "TOGGLE SWITCH 1-POLE WHITE", quantity: 20, ordered: 20, unit: "EA" },
    ],
    expected_flags: ["not_on_po", "missing_from_shipment"],
  },
  {
    id: "15-handwritten-farm-invoice",
    title: "Handwritten invoice from a small farm",
    tests: "Handwritten, Spanish, no item numbers and no PO number, like many small local suppliers.",
    template: "handwritten",
    output: "photo",
    photo: { rotate: -1.5, blur: 0.3, quality: 75, scale: 1.4 },
    document_type: "invoice",
    language: "es",
    supplier: LOSPINOS,
    number: "0347",
    date_printed: "31/10/2026",
    date_iso: "2026-10-31",
    po_printed: null,
    has_po: false,
    lines: [
      { sku: null, description: "Guineos verdes", quantity: 40, unit: "LB", unit_price: 0.85 },
      { sku: null, description: "Plátanos", quantity: 60, unit: "UN", unit_price: 0.6 },
      { sku: null, description: "Aguacates", quantity: 24, unit: "UN", unit_price: 1.5 },
      { sku: null, description: "Café en grano", quantity: 10, unit: "LB", unit_price: 9.0 },
    ],
    expected_flags: ["missing_sku", "po_missing"],
  },
  {
    id: "16-invoice-odd-formats",
    title: "Invoice with unusual date and PO formats",
    tests: "Date printed as 07-OCT-26 and PO as 'PO# 4500-0193' while the store's system stores 45000193.",
    template: "printout",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: BLUEWATER,
    number: "BW-0093288",
    date_printed: "07-OCT-26",
    date_iso: "2026-10-07",
    po_printed: "4500-0193",
    po_system: "45000193",
    lines: [
      { sku: "BW-PT-800", description: "PAPER TOWEL ROLLS KITCHEN", quantity: 4, unit: "CS", unit_price: 32.9 },
      { sku: "BW-FL-18", description: "ALUMINUM FOIL ROLL 18IN", quantity: 2, unit: "RL", unit_price: 21.4 },
    ],
    shipping: 18.5,
    expected_flags: [],
  },
  {
    id: "17-invoice-duplicate-lines-over",
    title: "Invoice with the same item twice",
    tests: "One item billed on two lines (two lots). Together they are more than was ordered.",
    template: "modern",
    output: "pdf",
    document_type: "invoice",
    language: "en",
    supplier: SUMMIT,
    number: "SSW-77231",
    date_printed: "2026-11-01",
    date_iso: "2026-11-01",
    po_printed: "PO-11099",
    lines: [
      {
        sku: "SN-2205",
        description: "Granola Bars Oat Honey",
        quantity: 6,
        unit: "CS",
        unit_price: 20.4,
        remark: "Lot 26-284",
        po_quantity: 10,
      },
      { sku: "SN-2206", description: "Granola Bars Chocolate Chip", quantity: 10, unit: "CS", unit_price: 20.4 },
      {
        sku: "SN-2205",
        description: "Granola Bars Oat Honey",
        quantity: 6,
        unit: "CS",
        unit_price: 20.4,
        remark: "Lot 26-291",
      },
    ],
    expected_flags: ["duplicate_sku", "qty_over"],
  },
  {
    id: "18-factura-photo-price",
    title: "Photo of a Spanish invoice billed above the PO price",
    tests: "Phone photo, Spanish. Coffee billed at $62.40 a case when the PO says $58.80.",
    template: "factura",
    output: "photo",
    photo: { rotate: 2, blur: 0.5, quality: 68, scale: 1.3 },
    document_type: "invoice",
    language: "es",
    supplier: CEIBA,
    number: "F-0012603",
    date_printed: "02/11/2026",
    date_iso: "2026-11-02",
    po_printed: "OC-11101",
    lines: [
      {
        sku: "LC-CAF-14",
        description: "Café molido 14 oz, caja de 12",
        quantity: 6,
        unit: "CJ",
        pack_size: 12,
        unit_price: 62.4,
        po_unit_price: 58.8,
      },
      {
        sku: "LC-AZU-04",
        description: "Azúcar refinada 4 lb, caja de 10",
        quantity: 4,
        unit: "CJ",
        pack_size: 10,
        unit_price: 29.5,
      },
      {
        sku: "LC-ARZ-03",
        description: "Arroz grano largo 3 lb, caja de 12",
        quantity: 8,
        unit: "CJ",
        pack_size: 12,
        unit_price: 21.6,
      },
    ],
    tax_rate: 0.115,
    tax_label: "IVU 11.5%",
    expected_flags: ["price_mismatch"],
  },
];
