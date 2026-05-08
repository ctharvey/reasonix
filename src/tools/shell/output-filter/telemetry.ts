/** Output filter telemetry ΓÇö tracks token savings per tool call and session totals.
 *  Telemetry is for TUI/human visibility only ΓÇö it must never change model prompts. */

export interface FilterTelemetryEntry {
  command: string;
  filterKind: string;
  rawChars: number;
  filteredChars: number;
  estimatedRawTokens: number;
  estimatedFilteredTokens: number;
  savingsPct: number;
  rawOutputId: number | null;
  fallbackUsed: boolean;
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
}

/** Rough token estimation: ~4 chars per token for English/code text. */
const CHARS_PER_TOKEN = 4;

function estimateTokens(charCount: number): number {
  return Math.round(charCount / CHARS_PER_TOKEN);
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
    }

    const estimatedRawTokens = estimateTokens(totalRawChars);
    const estimatedFilteredTokens = estimateTokens(totalFilteredChars);

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

    return [
      `tool output raw: ${formatChars(s.totalRawChars)} chars`,
      `tool output filtered: ${formatChars(s.totalFilteredChars)} chars`,
      `estimated saved: ${formatChars(s.estimatedSavedTokens)} tokens`,
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

  getFilterTelemetryStore().record({
    command: opts.command,
    filterKind: opts.filterKind,
    rawChars: opts.rawChars,
    filteredChars: opts.filteredChars,
    estimatedRawTokens: estimateTokens(opts.rawChars),
    estimatedFilteredTokens: estimateTokens(opts.filteredChars),
    savingsPct,
    rawOutputId: opts.rawOutputId,
    fallbackUsed: opts.fallbackUsed,
    timestamp: Date.now(),
  });
}
