// The small back end. It does three things:
//   1. Holds the API key and is the only place that calls Claude (POST /api/extract).
//   2. Serves the sample documents, answer keys, saved AI results and purchase orders.
//   3. Keeps spending under the project limit (see spend.ts).
//
// Run with `npm run dev` (together with the web page) or `npm start`.

import "./env"; // must be first: loads .env before other files read settings
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { DEFAULT_MODEL, ExtractionError, extractDocument, isSupportedType } from "./extract";
import { estimateDocumentCost } from "./estimate";
import { BudgetError, SpendLog } from "./spend";

const ROOT = process.cwd();
const SAMPLES = path.join(ROOT, "samples");
const RESULTS = path.join(ROOT, "eval", "results");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SAFE_NAME = /^[\w.-]+$/; // stops "../" tricks in file names

const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

export function createApp(deps: { client?: Anthropic; spend?: SpendLog } = {}) {
  const spend = deps.spend ?? new SpendLog();
  let client = deps.client;
  const app = new Hono();

  app.get("/api/status", (c) =>
    c.json({
      live: Boolean(client) || hasKey(),
      model: DEFAULT_MODEL,
      spentUsd: spend.totalUsd(),
      limitUsd: spend.limitUsd,
    }),
  );

  app.get("/api/samples", async (c) => {
    const index = JSON.parse(await readFile(path.join(SAMPLES, "documents", "index.json"), "utf8"));
    // Which models have saved results for each sample (from `npm run eval`).
    const models = existsSync(RESULTS) ? await readdir(RESULTS) : [];
    for (const item of index) {
      item.savedResults = models.filter((m) => existsSync(path.join(RESULTS, m, `${item.id}.json`)));
    }
    return c.json(index);
  });

  app.get("/api/samples/file/:name", async (c) => {
    const name = c.req.param("name");
    if (!SAFE_NAME.test(name)) return c.json({ error: "Bad file name" }, 400);
    const file = path.join(SAMPLES, "documents", name);
    if (!existsSync(file)) return c.json({ error: "Not found" }, 404);
    const type = name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    return c.body(await readFile(file), 200, { "content-type": type });
  });

  app.get("/api/samples/:id/answer", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_NAME.test(id)) return c.json({ error: "Bad id" }, 400);
    const file = path.join(SAMPLES, "answers", `${id}.json`);
    if (!existsSync(file)) return c.json({ error: "Not found" }, 404);
    return c.json(JSON.parse(await readFile(file, "utf8")));
  });

  app.get("/api/samples/:id/result/:model", async (c) => {
    const { id, model } = c.req.param();
    if (!SAFE_NAME.test(id) || !SAFE_NAME.test(model)) return c.json({ error: "Bad id" }, 400);
    const file = path.join(RESULTS, model, `${id}.json`);
    if (!existsSync(file)) return c.json({ error: "No saved result. Run `npm run eval` first." }, 404);
    return c.json(JSON.parse(await readFile(file, "utf8")));
  });

  app.get("/api/purchase-orders", async (c) => {
    const dir = path.join(SAMPLES, "purchase-orders");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    return c.json(await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8")))));
  });

  app.post("/api/extract", async (c) => {
    if (!client) {
      if (!hasKey()) return c.json({ error: "No API key. Add ANTHROPIC_API_KEY to .env to read new documents." }, 503);
      client = new Anthropic();
    }
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) return c.json({ error: "Attach a file in the 'file' field." }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is larger than 10 MB." }, 413);
    if (!isSupportedType(file.type))
      return c.json(
        { error: `Unsupported file type ${file.type || "(unknown)"}. Use PDF, JPEG, PNG, WebP or GIF.` },
        415,
      );

    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      spend.assertCanSpend(estimateDocumentCost(bytes, file.type, DEFAULT_MODEL));
      const result = await extractDocument(client, bytes, file.type);
      spend.add({
        what: `app: ${file.name}`,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd ?? 0,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof BudgetError) return c.json({ error: err.message }, 402);
      if (err instanceof ExtractionError) return c.json({ error: err.message }, 422);
      if (err instanceof Anthropic.AuthenticationError)
        return c.json({ error: "The API key was rejected. Check .env." }, 502);
      if (err instanceof Anthropic.RateLimitError)
        return c.json({ error: "Rate limited by the API. Wait a minute and try again." }, 429);
      if (err instanceof Anthropic.APIError)
        return c.json({ error: `Claude API error ${err.status}: ${err.message}` }, 502);
      throw err;
    }
  });

  // In production, serve the built web page too.
  if (existsSync(path.join(ROOT, "dist"))) {
    app.use("/*", serveStatic({ root: "./dist" }));
  }
  return app;
}
