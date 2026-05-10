/** Output filter telemetry — tracks token savings per tool call and session totals.
 *  Uses real DeepSeek BPE tokenizer when available; heuristic fallback for large strings. */

import { countTokens } from "@/tokenizer.js";

export interface FilterTelemetryEntry {
  /** Command string for shell tools; tool name for dispatch-level filters. */
  command: string;
  /** Tool name when available (dispatch-level filters set this). Null for shell-only entries. */
  tool: string | null;
  filterKind: string;
  rawChars: number;
  filteredChars: number;
  estimatedRawTokens: number;
  estimatedFilteredTokens: number;
  savingsPct: number;
  rawOutputId: number | null;
  fallbackUsed: boolean;
  /** True when token counts came from the heuristic fallback (tokenizer unavailable or string too large). */
  tokenCountsAreEstimate: boolean;
  timestamp: number;
}

export interface FilterTelemetrySummary {
  totalCalls: number;
  filteredCalls: number;
  fallbackCalls: number;
  totalRawChars: number;
  totalFilteredChars: number;
  estimatedRawTokens: number;
  estimatedFilteredTokens: number;
  estimatedSavedTokens: number;
  averageSavingsPct: number;
  /** True when any entry used heuristic token estimation. */
  tokenCountsAreEstimate: boolean;
}

/** Heuristic fallback: ~4 chars per token for English/code text. */
const CHARS_PER_TOKEN = 4;

/** Max string length (chars) to run through the real BPE tokenizer — pathological
 *  repetitive text can cost 30s+ on the pure-TS BPE port (see mcp/registry.ts). */
const MAX_TOKENIZE_CHARS = 100_000;

function estimateTokensHeuristic(charCount: number): number {
  return Math.round(charCount / CHARS_PER_TOKEN);
}

/** Count tokens using the real BPE tokenizer when safe; fall back to heuristic for large strings. */
function countTokensSafe(text: string): { tokens: number; isEstimate: boolean } {
  if (text.length > MAX_TOKENIZE_CHARS) {
    return { tokens: estimateTokensHeuristic(text.length), isEstimate: true };
  }
  try {
    return { tokens: countTokens(text), isEstimate: false };
  } catch {
    return { tokens: estimateTokensHeuristic(text.length), isEstimate: true };
  }
}

/** Session-scoped telemetry store. Reset between sessions. */
class FilterTelemetryStore {
  private entries: FilterTelemetryEntry[] = [];
  private readonly maxEntries = 10_000;

  /** Record a filter invocation. */
  record(entry: FilterTelemetryEntry): void {
    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
    this.entries.push(entry);
  }

  /** Get all recorded entries. */
  getEntries(): readonly FilterTelemetryEntry[] {
    return this.entries;
  }

  /** Compute session totals. */
  getSummary(): FilterTelemetrySummary {
    let totalRawChars = 0;
    let totalFilteredChars = 0;
    let filteredCalls = 0;
    let fallbackCalls = 0;
    let savingsSum = 0;
    let savingsCount = 0;
    let anyEstimate = false;

    for (const entry of this.entries) {
      totalRawChars += entry.rawChars;
      totalFilteredChars += entry.filteredChars;
      if (entry.fallbackUsed) {
        fallbackCalls++;
      } else {
        filteredCalls++;
      }
      if (entry.rawChars > 0) {
        savingsSum += entry.savingsPct;
        savingsCount++;
      }
      if (entry.tokenCountsAreEstimate) anyEstimate = true;
    }

    const estimatedRawTokens = this.entries.reduce((sum, e) => sum + e.estimatedRawTokens, 0);
    const estimatedFilteredTokens = this.entries.reduce(
      (sum, e) => sum + e.estimatedFilteredTokens,
      0,
    );

    return {
      totalCalls: this.entries.length,
      filteredCalls,
      fallbackCalls,
      totalRawChars,
      totalFilteredChars,
      estimatedRawTokens,
      estimatedFilteredTokens,
      estimatedSavedTokens: estimatedRawTokens - estimatedFilteredTokens,
      averageSavingsPct: savingsCount > 0 ? Math.round(savingsSum / savingsCount) : 0,
      tokenCountsAreEstimate: anyEstimate,
    };
  }

  /** Format summary for TUI display. */
  formatSummary(): string {
    const s = this.getSummary();
    if (s.totalCalls === 0) return "No filter activity recorded.";

    const formatChars = (n: number): string => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
      return String(n);
    };

    const estTag = s.tokenCountsAreEstimate ? "~" : "";

    return [
      `tool output raw: ${formatChars(s.totalRawChars)} chars`,
      `tool output filtered: ${formatChars(s.totalFilteredChars)} chars`,
      `${estTag}saved: ${formatChars(s.estimatedSavedTokens)} tokens`,
      `average savings: ${s.averageSavingsPct}%`,
      `fallbacks: ${s.fallbackCalls}`,
    ].join("\n");
  }

  /** Reset the store (for testing or new session). */
  reset(): void {
    this.entries = [];
  }
}

let storeInstance: FilterTelemetryStore | null = null;

/** Get the singleton telemetry store. */
export function getFilterTelemetryStore(): FilterTelemetryStore {
  if (!storeInstance) {
    storeInstance = new FilterTelemetryStore();
  }
  return storeInstance;
}

/** Reset the telemetry store (for testing). */
export function resetFilterTelemetryStore(): void {
  if (storeInstance) {
    storeInstance.reset();
  }
}

/** Record a filter result in the telemetry store. */
export function recordFilterTelemetry(opts: {
  command: string;
  tool?: string;
  filterKind: string;
  rawChars: number;
  filteredChars: number;
  rawOutputId: number | null;
  fallbackUsed: boolean;
}): void {
  const savingsPct =
    opts.rawChars > 0
      ? Math.round(((opts.rawChars - opts.filteredChars) / opts.rawChars) * 100)
      : 0;

  // Use real BPE tokenizer when safe; heuristic fallback for large strings.
  const rawText = opts.fallbackUsed ? "" : "";
  // We don't have the raw/filtered strings here — only char counts.
  // Use per-entry heuristic and let summary aggregate from stored entries.
  // For accurate token counts, the caller should pass the strings via
  // recordFilterTelemetryWithTokens() instead.
  const estimatedRawTokens = estimateTokensHeuristic(opts.rawChars);
  const estimatedFilteredTokens = estimateTokensHeuristic(opts.filteredChars);

  getFilterTelemetryStore().record({
    command: opts.command,
    tool: opts.tool ?? null,
    filterKind: opts.filterKind,
    rawChars: opts.rawChars,
    filteredChars: opts.filteredChars,
    estimatedRawTokens,
    estimatedFilteredTokens,
    savingsPct,
    rawOutputId: opts.rawOutputId,
    fallbackUsed: opts.fallbackUsed,
    tokenCountsAreEstimate: true,
    timestamp: Date.now(),
  });
}

/** Record a filter result with real token counts (when the raw/filtered strings are available). */
export function recordFilterTelemetryWithTokens(opts: {
  command: string;
  tool?: string;
  filterKind: string;
  rawText: string;
  filteredText: string;
  rawChars: number;
  filteredChars: number;
  rawOutputId: number | null;
  fallbackUsed: boolean;
}): void {
  const savingsPct =
    opts.rawChars > 0
      ? Math.round(((opts.rawChars - opts.filteredChars) / opts.rawChars) * 100)
      : 0;

  const rawResult = countTokensSafe(opts.rawText);
  const filteredResult = countTokensSafe(opts.filteredText);

  getFilterTelemetryStore().record({
    command: opts.command,
    tool: opts.tool ?? null,
    filterKind: opts.filterKind,
    rawChars: opts.rawChars,
    filteredChars: opts.filteredChars,
    estimatedRawTokens: rawResult.tokens,
    estimatedFilteredTokens: filteredResult.tokens,
    savingsPct,
    rawOutputId: opts.rawOutputId,
    fallbackUsed: opts.fallbackUsed,
    tokenCountsAreEstimate: rawResult.isEstimate || filteredResult.isEstimate,
    timestamp: Date.now(),
  });
}
