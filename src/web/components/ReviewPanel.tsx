// The review step ("human in the loop").
//
// Shows what was read, runs the plain-code checks on it, and highlights what a
// person must look at. Every field can be corrected; the checks re-run on each
// edit. The checked result can be downloaded as CSV for Excel or Google Sheets.

import { useMemo, useState } from "react";
import { normalizeSku, runChecks, type Flag } from "../../shared/checks";
import { toCsv } from "../../shared/csv";
import type { Extraction, LineItem, PurchaseOrder } from "../../shared/schema";
import type { Reading } from "../api";

type TotalKey = "subtotal" | "discount" | "shipping" | "tax" | "total";
type HeaderKey = "supplier_name" | "document_number" | "document_date" | "po_number";

const toNumber = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

export function ReviewPanel({
  reading,
  orders,
  fileName,
}: {
  reading: Reading;
  orders: PurchaseOrder[];
  fileName: string;
}) {
  const [doc, setDoc] = useState<Extraction>(reading.extraction);
  const [checked, setChecked] = useState<boolean[]>(() => reading.extraction.line_items.map(() => false));
  const [edited, setEdited] = useState(false);

  const flags = useMemo(() => runChecks(doc, orders), [doc, orders]);
  const problems = flags.filter((f) => f.severity === "problem");
  const toCheck = flags.filter((f) => f.severity === "check");
  const lineFlags = (i: number) => flags.filter((f) => f.line === i);
  const po = doc.po_number ? orders.find((o) => normalizeSku(o.po_number) === normalizeSku(doc.po_number!)) : undefined;

  function change(next: Extraction) {
    setDoc(next);
    setEdited(true);
  }
  const setHeader = (k: HeaderKey, v: string) => change({ ...doc, [k]: v.trim() === "" ? null : v });
  const setTotal = (k: TotalKey, v: string) => change({ ...doc, [k]: toNumber(v) });
  const setLine = (i: number, patch: Partial<LineItem>) =>
    change({ ...doc, line_items: doc.line_items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  function exportCsv() {
    const csv = toCsv(doc, {
      checkedLines: checked,
      flagsByLine: doc.line_items.map((_, i) => lineFlags(i).map((f) => f.message)),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${fileName}-checked.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  // Hide columns the document doesn't have (decided once, so they don't vanish while you edit).
  const [cols] = useState(() => {
    const items = reading.extraction.line_items;
    return {
      pack: items.some((l) => l.pack_size !== null),
      bo: items.some((l) => l.quantity_backordered !== null),
      money: items.some((l) => l.unit_price !== null || l.line_total !== null),
    };
  });

  const allChecked = checked.length > 0 && checked.every(Boolean);

  return (
    <div className="panel">
      <p className={`source ${reading.isAnswerKey ? "answer-key" : ""}`}>
        {reading.source}
        {reading.costUsd != null && <> · ${reading.costUsd.toFixed(4)}</>}
        {reading.seconds != null && <> · {reading.seconds.toFixed(1)} s</>}
        {edited && <> · edited by you</>}
      </p>

      <div className={`verdict ${problems.length ? "bad" : toCheck.length ? "warn" : "good"}`}>
        {problems.length === 0 && toCheck.length === 0
          ? "No problems found. Spot-check and accept."
          : `${problems.length} problem${problems.length === 1 ? "" : "s"} to resolve, ${toCheck.length} thing${toCheck.length === 1 ? "" : "s"} to check`}
        <span className="po">
          {po ? `Matched to ${po.po_number}` : doc.po_number ? `PO ${doc.po_number} not found` : "No PO number"}
        </span>
      </div>

      {flags.length > 0 && (
        <ul className="flags">
          {flags.map((f, i) => (
            <FlagItem key={i} flag={f} />
          ))}
        </ul>
      )}

      <div className="fields">
        <Field label="Supplier" value={doc.supplier_name} onChange={(v) => setHeader("supplier_name", v)} />
        <Field
          label={
            doc.document_type === "invoice"
              ? "Invoice #"
              : doc.document_type === "packing_slip"
                ? "Packing slip #"
                : "Document #"
          }
          value={doc.document_number}
          onChange={(v) => setHeader("document_number", v)}
        />
        <Field label="Date" value={doc.document_date} onChange={(v) => setHeader("document_date", v)} />
        <Field label="PO #" value={doc.po_number} onChange={(v) => setHeader("po_number", v)} />
      </div>

      <div className="table-wrap">
        <table className="lines">
          <thead>
            <tr>
              <th title="Checked by a person">✓</th>
              <th>SKU</th>
              <th>Description</th>
              <th className="n">Qty</th>
              <th>Unit</th>
              {cols.pack && <th className="n">Pack</th>}
              {cols.bo && <th className="n">B/O</th>}
              {cols.money && <th className="n">Price</th>}
              {cols.money && <th className="n">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {doc.line_items.map((l, i) => {
              const lf = lineFlags(i);
              const cls = lf.some((f) => f.severity === "problem") ? "problem" : lf.length ? "check" : "";
              return (
                <tr key={i} className={cls} title={lf.map((f) => f.message).join("\n")}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Line ${i + 1} checked`}
                      checked={checked[i] ?? false}
                      onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))}
                    />
                  </td>
                  <TextCell
                    value={l.sku}
                    label={`Line ${i + 1} SKU`}
                    className="sku"
                    onChange={(v) => setLine(i, { sku: v })}
                  />
                  <TextCell
                    value={l.description}
                    label={`Line ${i + 1} description`}
                    wide
                    onChange={(v) => setLine(i, { description: v ?? "" })}
                  />
                  <NumCell
                    value={l.quantity}
                    label={`Line ${i + 1} quantity`}
                    onChange={(v) => setLine(i, { quantity: v })}
                  />
                  <TextCell value={l.unit} label={`Line ${i + 1} unit`} onChange={(v) => setLine(i, { unit: v })} />
                  {cols.pack && (
                    <NumCell
                      value={l.pack_size}
                      label={`Line ${i + 1} pack size`}
                      onChange={(v) => setLine(i, { pack_size: v })}
                    />
                  )}
                  {cols.bo && (
                    <NumCell
                      value={l.quantity_backordered}
                      label={`Line ${i + 1} back-ordered`}
                      onChange={(v) => setLine(i, { quantity_backordered: v })}
                    />
                  )}
                  {cols.money && (
                    <NumCell
                      money
                      value={l.unit_price}
                      label={`Line ${i + 1} unit price`}
                      onChange={(v) => setLine(i, { unit_price: v })}
                    />
                  )}
                  {cols.money && (
                    <NumCell
                      money
                      value={l.line_total}
                      label={`Line ${i + 1} amount`}
                      onChange={(v) => setLine(i, { line_total: v })}
                    />
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {doc.document_type === "invoice" && (
        <div className="fields totals">
          {(["subtotal", "discount", "shipping", "tax", "total"] as TotalKey[]).map((k) => (
            <MoneyField
              key={k}
              label={k[0].toUpperCase() + k.slice(1)}
              value={doc[k]}
              onChange={(v) => setTotal(k, v)}
            />
          ))}
        </div>
      )}

      <div className="actions">
        <button onClick={() => setChecked(checked.map(() => !allChecked))}>
          {allChecked ? "Uncheck all lines" : "Mark all lines checked"}
        </button>
        <button className="primary" onClick={exportCsv}>
          Download checked CSV
        </button>
      </div>
    </div>
  );
}

function FlagItem({ flag }: { flag: Flag }) {
  return (
    <li className={flag.severity}>
      <span className="sev">{flag.severity === "problem" ? "Problem" : "Check"}</span>
      {flag.line !== undefined && <span className="where">Line {flag.line + 1}</span>}
      {flag.message}
    </li>
  );
}

function Field({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ""} placeholder="not found" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value === null ? "" : value.toFixed(2));
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder="not found"
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function TextCell(props: {
  value: string | null;
  label: string;
  wide?: boolean;
  className?: string;
  onChange: (v: string | null) => void;
}) {
  const { value, label, wide, className, onChange } = props;
  return (
    <td className={wide ? "wide" : (className ?? "")}>
      <input
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    </td>
  );
}

/** Number input that lets you type freely ("12." or "") and only stores valid numbers. */
function NumCell({
  value,
  label,
  money,
  onChange,
}: {
  value: number | null;
  label: string;
  money?: boolean;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : money ? value.toFixed(2) : String(value));
  return (
    <td className="n">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toNumber(e.target.value));
        }}
      />
    </td>
  );
}
