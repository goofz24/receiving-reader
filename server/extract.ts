// Send one document (PDF or photo) to the Claude API and get back checked JSON.
//
// This is the only file that talks to the AI. The API key is read on the
// server from the ANTHROPIC_API_KEY environment variable and never reaches
// the browser.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Extraction } from "../src/shared/schema";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";

// Haiku 5.5 is the default because it costs about 1/40 of Opus 5.5 per document
// and Mel's whole API budget is $10. The evaluation shows whether it is accurate enough;
// pass --model claude-opus-5-5 (or set CLAUDE_MODEL) to compare.
export const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-5-5";

export const SUPPORTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type SupportedType = (typeof SUPPORTED_TYPES)[number];

/** US dollars per million tokens (Anthropic list prices, checked 2026-11-03). */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ExtractOptions {
  model?: string;
  effort?: Effort;
}

export interface ExtractResult {
  extraction: Extraction;
  /** Model that actually answered (can differ if the safety fallback stepped in). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in US dollars, or null when the model is not in the price list. */
  costUsd: number | null;
  seconds: number;
}

/** Something went wrong that a person needs to handle (not a network hiccup). */
export class ExtractionError extends Error {}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function isSupportedType(t: string): t is SupportedType {
  return (SUPPORTED_TYPES as readonly string[]).includes(t);
}

/** Build the message content: the document first, then the instruction. */
export function buildContent(data: Uint8Array, mediaType: SupportedType): Anthropic.Beta.BetaContentBlockParam[] {
  const base64 = Buffer.from(data).toString("base64");
  const doc: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  return [doc, { type: "text", text: USER_PROMPT }];
}

export async function extractDocument(
  client: Anthropic,
  data: Uint8Array,
  mediaType: SupportedType,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const started = Date.now();

  const response = await client.beta.messages
    .parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildContent(data, mediaType) }],
      // Structured outputs: the API makes the model answer in the schema's exact shape,
      // and the SDK checks it again with Zod and puts the result in parsed_output.
      output_config: { format: betaZodOutputFormat(Extraction), effort: options.effort ?? "medium" },
      // If a safety check declines the request, let the API retry it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })
    .catch((err: unknown) => {
      // The SDK checks the answer with Zod. A plain AnthropicError (not an APIError)
      // means the answer came back but did not fit the schema, e.g. an unknown document_type.
      if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError)) {
        throw new ExtractionError("The answer did not match the expected format. Try again or enter it by hand.");
      }
      throw err;
    });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("The model declined to read this document. Enter it by hand.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("The document is too long to read in one pass. Split it into smaller files.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("The answer did not match the expected format. Try again or enter it by hand.");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  return {
    extraction: response.parsed_output,
    model: response.model,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(model, inputTokens, outputTokens),
    seconds: (Date.now() - started) / 1000,
  };
}
