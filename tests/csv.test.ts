import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../src/shared/csv";
import { doc, line } from "./fixtures";

describe("CSV export", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Bolt, 1/4" zinc')).toBe('"Bolt, 1/4"" zinc"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  it("blocks spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(-4.5)).toBe("-4.5");
  });

  it("writes one row per line with the header repeated", () => {
    const csv = toCsv(doc({ line_items: [line(), line({ sku: "B-2" })] }), {
      checkedLines: [true, false],
      flagsByLine: [[], ["Short shipment"]],
    });
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^supplier,document_type/);
    expect(rows[1]).toBe("Acme Supply,invoice,INV-1,2026-10-01,PO-1,1,A-1,Widget,2,EA,,,5,10,yes,");
    expect(rows[2].endsWith(",no,Short shipment")).toBe(true);
  });
});
