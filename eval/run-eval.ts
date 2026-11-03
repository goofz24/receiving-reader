// npm run eval -- [options]
//
// Measures how accurately the reader handles the 18 sample documents.
//
//   --dry-run            Show what a run would cost. Calls nothing, spends nothing.
//   --self-test          Score the answer keys against themselves (should be 100%). Free.
//                        Use it to see the report format and to check the scoring code.
//   --replay             Re-score saved AI results from an earlier run. Free.
//   --model <id>         Model to test (default: claude-haiku-5-5).
//   --only 01,05         Only some documents (matches the start of the id).
//   --max-usd 1.00       Stop the run before it costs more than this.
//   --yes                Don't ask for confirmation before a paid run.
//
// A paid run saves each AI answer in eval/results/<model>/ so it can be
// replayed and shown in the app later without paying again, and writes a
// report to eval/reports/.

import "../server/env";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type { FlagCode } from "../src/shared/checks";
import { Extraction, PurchaseOrder } from "../src/shared/schema";
import { scoreDocument, summarize, type DocScore, type Summary } from "../src/shared/score";
import { estimateDocumentCost } from "../server/estimate";
import { DEFAULT_MODEL, extractDocument, type ExtractResult } from "../server/extract";
import { SpendLog } from "../server/spend";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "samples", "documents");
const ANSWERS = path.join(ROOT, "samples", "answers");
const POS = path.join(ROOT, "samples", "purchase-orders");

interface AnswerFile {
  id: string;
  file: string;
  title: string;
  tests: string;
  expected_flags: FlagCode[];
  answer: Extraction;
}

interface SavedResult extends Partial<ExtractResult> {
  id: string;
  at: string;
  error?: string;
}

const EMPTY: Extraction = {
  document_type: "other",
  language: "en",
  supplier_name: null,
  document_number: null,
  document_date: null,
  po_number: null,
  currency: null,
  line_items: [],
  subtotal: null,
  tax: null,
  shipping: null,
  discount: null,
  total: null,
  warnings: [],
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
const mediaType = (file: string) => (file.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
const show = (v: unknown) => (v === null ? "null" : typeof v === "string" ? v : JSON.stringify(v));

async function loadJsonDir<T>(dir: string): Promise<T[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")) as T));
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

function report(
  label: string,
  model: string,
  answers: AnswerFile[],
  scores: DocScore[],
  sum: Summary,
  results: SavedResult[],
): string {
  const cost = results.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const secs = results.filter((r) => r.seconds).map((r) => r.seconds!);
  const failed = results.filter((r) => r.error);
  const lines: string[] = [];
  lines.push(`# Accuracy report: ${label}`, "");
  lines.push(
    `Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Model: \`${model}\`. Documents: ${sum.documents}.`,
    "",
  );
  lines.push("| Measure | Result |", "|---|---|");
  lines.push(`| Field accuracy | **${pct(sum.fieldAccuracy)}** (${sum.correct} of ${sum.total} fields) |`);
  lines.push(`| Line items found | ${sum.linesMatched} of ${sum.linesExpected} |`);
  lines.push(`| Extra lines invented | ${sum.extraLines} |`);
  lines.push(`| Planted problems caught | ${sum.flagsCaught} of ${sum.flagsExpected} |`);
  lines.push(`| Documents with a false alarm | ${sum.falseAlarmDocs} |`);
  if (failed.length) lines.push(`| Documents that failed to read | ${failed.length} |`);
  if (results.some((r) => r.costUsd !== undefined)) {
    lines.push(`| API cost of this run | ${usd(cost)} (${usd(cost / Math.max(1, results.length))} per document) |`);
  }
  if (secs.length)
    lines.push(`| Average time per document | ${(secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1)} s |`);
  lines.push("");

  lines.push("## Accuracy by field (weakest first)", "", "| Field | Right | Accuracy |", "|---|---|---|");
  for (const f of sum.byField) lines.push(`| ${f.field} | ${f.correct} / ${f.total} | ${pct(f.accuracy)} |`);
  lines.push("");

  lines.push(
    "## By document",
    "",
    "| Document | Field accuracy | Problems caught | Missed | False alarms |",
    "|---|---|---|---|---|",
  );
  scores.forEach((s, i) => {
    lines.push(
      `| ${answers[i].id} | ${pct(s.correct / s.total)} | ${s.caughtFlags.length} / ${s.expectedFlags.length} | ${s.missedFlags.join(", ") || "-"} | ${s.extraProblemFlags.join(", ") || "-"} |`,
    );
  });
  lines.push("");

  const mistakes = scores.flatMap((s, i) => s.fields.filter((f) => !f.ok).map((f) => ({ id: answers[i].id, ...f })));
  lines.push(`## Every wrong field (${mistakes.length})`, "");
  if (mistakes.length === 0) lines.push("None.");
  else {
    lines.push("| Document | Where | Field | Answer key | AI read |", "|---|---|---|---|---|");
    for (const m of mistakes)
      lines.push(`| ${m.id} | ${m.where} | ${m.field} | ${show(m.expected)} | ${show(m.got)} |`);
  }
  if (failed.length) {
    lines.push("", "## Failed documents", "");
    for (const f of failed) lines.push(`- ${f.id}: ${f.error}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: "string", default: DEFAULT_MODEL },
      only: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "self-test": { type: "boolean", default: false },
      replay: { type: "boolean", default: false },
      "max-usd": { type: "string", default: "1.00" },
      yes: { type: "boolean", default: false },
    },
  });
  const model = values.model!;
  const maxUsd = Number(values["max-usd"]);

  let answers = await loadJsonDir<AnswerFile>(ANSWERS);
  if (values.only) {
    const prefixes = values.only.split(",").map((s) => s.trim());
    answers = answers.filter((a) => prefixes.some((p) => a.id.startsWith(p)));
  }
  const orders = (await loadJsonDir<unknown>(POS)).map((o) => PurchaseOrder.parse(o));
  const resultsDir = path.join(ROOT, "eval", "results", model);

  // Estimate first, always.
  const estimates = await Promise.all(
    answers.map(async (a) => estimateDocumentCost(await readFile(path.join(DOCS, a.file)), mediaType(a.file), model)),
  );
  const estimate = estimates.reduce((x, y) => x + y, 0);

  if (values["dry-run"]) {
    console.log(`Dry run: ${answers.length} documents with ${model}.`);
    console.log(`Estimated cost: about ${usd(estimate)} (estimates run high on purpose). Nothing was sent.`);
    return;
  }

  const results: SavedResult[] = [];
  let label = model;

  if (values["self-test"]) {
    label = "self-test (answer keys scored against themselves)";
    for (const a of answers) results.push({ id: a.id, at: new Date().toISOString(), extraction: a.answer });
  } else if (values.replay) {
    for (const a of answers) {
      const file = path.join(resultsDir, `${a.id}.json`);
      if (!existsSync(file)) throw new Error(`No saved result for ${a.id} with ${model}. Run without --replay first.`);
      results.push(JSON.parse(await readFile(file, "utf8")));
    }
    label = `${model} (replayed)`;
  } else {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Put it in .env (see README).");
    const spend = new SpendLog();
    console.log(`About to read ${answers.length} documents with ${model}.`);
    console.log(
      `Estimated cost: about ${usd(estimate)}. Project spend so far: ${usd(spend.totalUsd())} of ${usd(spend.limitUsd)}.`,
    );
    if (estimate > maxUsd)
      throw new Error(`Estimate is above --max-usd ${usd(maxUsd)}. Use --only or raise --max-usd.`);
    spend.assertCanSpend(estimate);
    if (!values.yes && !(await confirm('Type "yes" to spend it: '))) {
      console.log("Cancelled. Nothing was spent.");
      return;
    }

    const client = new Anthropic();
    await mkdir(resultsDir, { recursive: true });
    let runCost = 0;
    for (const [i, a] of answers.entries()) {
      if (runCost + estimates[i] > maxUsd) {
        console.log(`Stopping: the next document could pass the ${usd(maxUsd)} cap.`);
        break;
      }
      const bytes = await readFile(path.join(DOCS, a.file));
      let saved: SavedResult;
      try {
        const r = await extractDocument(client, bytes, mediaType(a.file), { model });
        runCost += r.costUsd ?? 0;
        spend.add({
          what: `eval: ${a.id}`,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costUsd: r.costUsd ?? 0,
        });
        saved = { id: a.id, at: new Date().toISOString(), ...r };
        console.log(
          `  ${a.id}: ${r.inputTokens} in / ${r.outputTokens} out, ${usd(r.costUsd ?? 0)}, ${r.seconds.toFixed(1)} s`,
        );
      } catch (err) {
        saved = { id: a.id, at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
        console.log(`  ${a.id}: FAILED - ${saved.error}`);
      }
      await writeFile(path.join(resultsDir, `${a.id}.json`), JSON.stringify(saved, null, 2) + "\n");
      results.push(saved);
    }
  }

  const scored = answers.slice(0, results.length);
  const scores = scored.map((a, i) =>
    scoreDocument(a.answer, results[i].extraction ?? EMPTY, a.expected_flags, orders),
  );
  const sum = summarize(scores);
  const md = report(label, values["self-test"] ? "(none)" : model, scored, scores, sum, results);

  const reportsDir = path.join(ROOT, "eval", "reports");
  await mkdir(reportsDir, { recursive: true });
  const name = `${values["self-test"] ? "self-test" : model}${values.replay ? "-replay" : ""}-${new Date().toISOString().slice(0, 10)}`;
  await writeFile(path.join(reportsDir, `${name}.md`), md);
  await writeFile(
    path.join(reportsDir, `${name}.json`),
    JSON.stringify({ label, model, summary: sum, documents: scores }, null, 2) + "\n",
  );

  console.log("");
  console.log(`Field accuracy: ${pct(sum.fieldAccuracy)} (${sum.correct}/${sum.total})`);
  console.log(`Line items found: ${sum.linesMatched}/${sum.linesExpected}, extra lines: ${sum.extraLines}`);
  console.log(
    `Planted problems caught: ${sum.flagsCaught}/${sum.flagsExpected}, documents with false alarms: ${sum.falseAlarmDocs}`,
  );
  console.log(
    `Weakest fields: ${sum.byField
      .slice(0, 3)
      .map((f) => `${f.field} ${pct(f.accuracy)}`)
      .join(", ")}`,
  );
  console.log(`Report: eval/reports/${name}.md`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
