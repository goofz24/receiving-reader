// Calls from the web page to our own back end. The page never talks to Claude directly.
import type { FlagCode } from "../shared/checks";
import type { Extraction, PurchaseOrder } from "../shared/schema";

export interface Status {
  live: boolean;
  model: string;
  spentUsd: number;
  limitUsd: number;
}

export interface SampleInfo {
  id: string;
  file: string;
  title: string;
  tests: string;
  expected_flags: FlagCode[];
  savedResults: string[];
}

export interface Reading {
  extraction: Extraction;
  /** Where this reading came from, shown to the user. */
  source: string;
  isAnswerKey: boolean;
  costUsd?: number | null;
  seconds?: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  status: () => get<Status>("/api/status"),
  samples: () => get<SampleInfo[]>("/api/samples"),
  purchaseOrders: () => get<PurchaseOrder[]>("/api/purchase-orders"),
  sampleFileUrl: (file: string) => `/api/samples/file/${encodeURIComponent(file)}`,

  async answerKey(id: string): Promise<Reading> {
    const r = await get<{ answer: Extraction }>(`/api/samples/${id}/answer`);
    return { extraction: r.answer, source: "Answer key (typed by hand, not an AI reading)", isAnswerKey: true };
  },

  async savedResult(id: string, model: string): Promise<Reading> {
    const r = await get<{ extraction?: Extraction; error?: string; costUsd?: number; seconds?: number; at: string }>(
      `/api/samples/${id}/result/${model}`,
    );
    if (!r.extraction) throw new Error(r.error ?? "This saved run failed to read the document.");
    return {
      extraction: r.extraction,
      source: `Saved AI reading by ${model} (${r.at.slice(0, 10)})`,
      isAnswerKey: false,
      costUsd: r.costUsd,
      seconds: r.seconds,
    };
  },

  async extract(file: File): Promise<Reading> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/extract", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    return {
      extraction: body.extraction,
      source: `Read just now by ${body.model}`,
      isAnswerKey: false,
      costUsd: body.costUsd,
      seconds: body.seconds,
    };
  },
};
