// Keeps a running total of what this project has spent on the Claude API,
// and refuses new paid calls once the limit is reached.
//
// Why: the whole API budget for Mel's portfolio projects is $10, shared with
// other projects. This project's own limit defaults to $2.00 (SPEND_LIMIT_USD).
// The log is a local file (.spend-log.json, not committed to git).
//
// This is a safety net on top of the spend limit you should also set in the
// Claude Console. The Console limit is the one that really protects the card.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SpendEntry {
  at: string;
  what: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const DEFAULT_LIMIT_USD = 2;

export class SpendLog {
  constructor(
    readonly file = path.resolve(process.cwd(), ".spend-log.json"),
    readonly limitUsd = Number(process.env.SPEND_LIMIT_USD ?? DEFAULT_LIMIT_USD),
  ) {}

  entries(): SpendEntry[] {
    if (!existsSync(this.file)) return [];
    return JSON.parse(readFileSync(this.file, "utf8")) as SpendEntry[];
  }

  totalUsd(): number {
    return this.entries().reduce((a, e) => a + e.costUsd, 0);
  }

  remainingUsd(): number {
    return Math.max(0, this.limitUsd - this.totalUsd());
  }

  /** Throws if spending `estimateUsd` more would go over the limit. */
  assertCanSpend(estimateUsd: number): void {
    const spent = this.totalUsd();
    if (spent + estimateUsd > this.limitUsd) {
      throw new BudgetError(
        `This would go over the $${this.limitUsd.toFixed(2)} limit for this project ` +
          `(spent so far: $${spent.toFixed(4)}, this call: about $${estimateUsd.toFixed(4)}).`,
      );
    }
  }

  add(entry: Omit<SpendEntry, "at">): void {
    const all = this.entries();
    all.push({ at: new Date().toISOString(), ...entry });
    writeFileSync(this.file, JSON.stringify(all, null, 2) + "\n");
  }
}

export class BudgetError extends Error {}
