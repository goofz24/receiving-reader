// Tests for the back end, with a fake Claude client and a temporary spend log.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../server/index";
import { SpendLog } from "../server/spend";
import { doc } from "./fixtures";

const tempLog = (limit = 2) => new SpendLog(path.join(mkdtempSync(path.join(tmpdir(), "spend-")), "log.json"), limit);

function fake() {
  const parse = vi.fn().mockResolvedValue({
    model: "claude-haiku-5-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 3000, output_tokens: 1000 },
    parsed_output: doc(),
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

function upload(type = "image/png", bytes: BlobPart = new Uint8Array(30)) {
  const form = new FormData();
  form.append("file", new File([bytes], "slip.png", { type }));
  return { method: "POST", body: form };
}

describe("server", () => {
  it("lists the 18 samples and serves their files and answer keys", async () => {
    const app = createApp({ spend: tempLog() });
    const list = await (await app.request("/api/samples")).json();
    expect(list).toHaveLength(18);
    const pdf = await app.request(`/api/samples/file/${list[0].file}`);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const answer = await (await app.request(`/api/samples/${list[0].id}/answer`)).json();
    expect(answer.answer.line_items.length).toBeGreaterThan(0);
  });

  it("refuses path tricks in file names", async () => {
    const app = createApp({ spend: tempLog() });
    expect((await app.request("/api/samples/file/..%2Fdata.ts")).status).toBe(400);
  });

  it("lists purchase orders", async () => {
    const pos = await (await createApp({ spend: tempLog() }).request("/api/purchase-orders")).json();
    expect(pos.length).toBe(17);
  });

  it("reads an upload, logs what it cost and returns the result", async () => {
    const { client, parse } = fake();
    const spend = tempLog();
    const res = await createApp({ client, spend }).request("/api/extract", upload());
    expect(res.status).toBe(200);
    expect((await res.json()).extraction.supplier_name).toBe("Acme Supply");
    expect(parse).toHaveBeenCalledOnce();
    expect(spend.entries()).toHaveLength(1);
    expect(spend.totalUsd()).toBeGreaterThan(0);
  });

  it("rejects unsupported file types without calling the API", async () => {
    const { client, parse } = fake();
    const res = await createApp({ client, spend: tempLog() }).request("/api/extract", upload("text/plain"));
    expect(res.status).toBe(415);
    expect(parse).not.toHaveBeenCalled();
  });

  it("stops paid calls once the spending limit is reached", async () => {
    const { client, parse } = fake();
    const spend = tempLog(0.001);
    spend.add({ what: "earlier", model: "claude-haiku-5-5", inputTokens: 0, outputTokens: 0, costUsd: 0.001 });
    const res = await createApp({ client, spend }).request("/api/extract", upload());
    expect(res.status).toBe(402);
    expect(parse).not.toHaveBeenCalled();
  });
});
