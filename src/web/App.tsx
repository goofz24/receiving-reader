// The whole page: sample list on the left, the document in the middle,
// and the review panel (what the AI read + what the checks found) on the right.

import { useEffect, useState } from "react";
import type { PurchaseOrder } from "../shared/schema";
import { api, type Reading, type SampleInfo, type Status } from "./api";
import { DocumentViewer } from "./components/DocumentViewer";
import { ReviewPanel } from "./components/ReviewPanel";

type Selection =
  | { kind: "sample"; sample: SampleInfo; source: string } // source: "answer" or a model id
  | { kind: "upload"; file: File; url: string };

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.status(), api.samples(), api.purchaseOrders()])
      .then(([st, list, pos]) => {
        setStatus(st);
        setSamples(list);
        setOrders(pos);
        if (list[0]) selectSample(list[0]);
      })
      .catch((e: Error) => setError(`Could not reach the back end: ${e.message}. Is "npm run dev" running?`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(task: () => Promise<Reading>) {
    setBusy(true);
    setError(null);
    setReading(null);
    try {
      setReading(await task());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function selectSample(sample: SampleInfo, source = sample.savedResults[0] ?? "answer") {
    setSelection({ kind: "sample", sample, source });
    load(() => (source === "answer" ? api.answerKey(sample.id) : api.savedResult(sample.id, source)));
  }

  function onUpload(file: File) {
    if (selection?.kind === "upload") URL.revokeObjectURL(selection.url);
    setSelection({ kind: "upload", file, url: URL.createObjectURL(file) });
    load(async () => {
      const r = await api.extract(file);
      api
        .status()
        .then(setStatus)
        .catch(() => {});
      return r;
    });
  }

  const docUrl = selection?.kind === "sample" ? api.sampleFileUrl(selection.sample.file) : selection?.url;
  const isPdf =
    selection?.kind === "sample" ? selection.sample.file.endsWith(".pdf") : selection?.file.type === "application/pdf";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Receiving Reader</h1>
          <p className="sub">
            Reads packing slips and invoices, checks them against the purchase order, and shows what a person must look
            at.
          </p>
        </div>
        {status && (
          <div className={`mode ${status.live ? "live" : ""}`}>
            {status.live ? (
              <>
                Live with <code>{status.model}</code>. Spent ${status.spentUsd.toFixed(3)} of $
                {status.limitUsd.toFixed(2)} limit
              </>
            ) : (
              <>Sample mode: no API key, nothing is sent to Claude</>
            )}
          </div>
        )}
      </header>

      <div className="layout">
        <nav className="samples" aria-label="Sample documents">
          <label className={`upload ${status?.live ? "" : "disabled"}`}>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={!status?.live || busy}
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
            {status?.live ? "Read a new document" : "Add an API key to read new documents"}
          </label>
          <h2>Test documents ({samples.length})</h2>
          <ol>
            {samples.map((s) => (
              <li key={s.id}>
                <button
                  className={selection?.kind === "sample" && selection.sample.id === s.id ? "active" : ""}
                  onClick={() => selectSample(s)}
                >
                  <span className="num">{s.id.slice(0, 2)}</span>
                  <span>
                    {s.title}
                    {s.expected_flags.length > 0 && <span className="tag">{s.expected_flags.length} planted</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="viewer">
          {docUrl ? <DocumentViewer url={docUrl} isPdf={Boolean(isPdf)} /> : <p className="empty">Pick a document.</p>}
        </main>

        <section className="review" aria-live="polite">
          {selection?.kind === "sample" && (
            <div className="source-picker">
              <p className="tests">
                <b>What this tests:</b> {selection.sample.tests}
              </p>
              <label>
                Show:{" "}
                <select value={selection.source} onChange={(e) => selectSample(selection.sample, e.target.value)}>
                  {selection.sample.savedResults.map((m) => (
                    <option key={m} value={m}>
                      AI reading by {m}
                    </option>
                  ))}
                  <option value="answer">Answer key</option>
                </select>
              </label>
            </div>
          )}
          {busy && (
            <p className="loading">
              {selection?.kind === "upload" ? "Reading the document with Claude..." : "Loading..."}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {reading && (
            <ReviewPanel
              key={`${selection?.kind === "sample" ? selection.sample.id + selection.source : selection?.url}`}
              reading={reading}
              orders={orders}
              fileName={selection?.kind === "sample" ? selection.sample.id : (selection?.file.name ?? "document")}
            />
          )}
        </section>
      </div>
    </div>
  );
}
