// Tests for the Claude API call, using a fake client so no money is spent.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildContent, estimateCost, ExtractionError, extractDocument } from "../server/extract";
import { estimateDocumentCost, imageSize, imageTokens, pdfPageCount } from "../server/estimate";
import { doc } from "./fixtures";

function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue({
    model: "claude-haiku-5-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 3000, output_tokens: 1000 },
    parsed_output: doc(),
    ...response,
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe("extractDocument", () => {
  it("sends the PDF, the prompt and the schema, and returns the parsed result with cost", async () => {
    const { client, parse } = fakeClient({});
    const r = await extractDocument(client, new Uint8Array([1, 2, 3]), "application/pdf", {
      model: "claude-haiku-5-5",
    });
    expect(r.extraction).toEqual(doc());
    expect(r.costUsd).toBeCloseTo((3000 * 0.1 + 1000 * 0.5) / 1e6, 10);

    const req = parse.mock.calls[0][0];
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.messages[0].content[0]).toMatchObject({
      type: "document",
      source: { media_type: "application/pdf", data: "AQID" },
    });
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.fallbacks).toBe("default");
  });

  it("sends photos as image blocks", () => {
    expect(buildContent(new Uint8Array([1]), "image/jpeg")[0]).toMatchObject({
      type: "image",
      source: { media_type: "image/jpeg" },
    });
  });

  it("turns a refusal, a cut-off answer or a bad format into a clear error", async () => {
    for (const bad of [{ stop_reason: "refusal" }, { stop_reason: "max_tokens" }, { parsed_output: null }]) {
      const { client } = fakeClient(bad);
      await expect(extractDocument(client, new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(ExtractionError);
    }
  });

  it("turns an answer that fails the schema check into a clear error", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const parse = vi.fn().mockRejectedValue(new Anthropic.AnthropicError("Failed to parse structured output"));
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    await expect(extractDocument(client, new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(ExtractionError);
  });

  it("lets real API errors (rate limits, bad key) through for the caller to handle", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const err = new Anthropic.RateLimitError(429, {}, "slow down", new Headers());
    const client = { beta: { messages: { parse: vi.fn().mockRejectedValue(err) } } } as unknown as Anthropic;
    await expect(extractDocument(client, new Uint8Array([1]), "image/png")).rejects.toBe(err);
  });

  it("knows prices for the three current models only", () => {
    expect(estimateCost("claude-opus-5-5", 1e6, 0)).toBe(4);
    expect(estimateCost("unknown-model", 1, 1)).toBeNull();
  });
});

describe("cost estimates", () => {
  it("reads image sizes from the sample photos", () => {
    const jpg = readFileSync("samples/documents/13-packing-slip-hand-correction.jpg");
    const size = imageSize(jpg)!;
    expect(size.width).toBeGreaterThan(500);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it("counts PDF pages", () => {
    expect(pdfPageCount(readFileSync("samples/documents/01-invoice-basic.pdf"))).toBe(1);
    expect(pdfPageCount(readFileSync("samples/documents/09-invoice-two-pages.pdf"))).toBe(2);
  });

  it("shrinks big images like the API does", () => {
    expect(imageTokens(3136, 3136)).toBe(imageTokens(1568, 1568));
  });

  it("estimates a Haiku document at well under one cent", () => {
    const pdf = readFileSync("samples/documents/01-invoice-basic.pdf");
    expect(estimateDocumentCost(pdf, "application/pdf", "claude-haiku-5-5")).toBeLessThan(0.01);
  });
});
