/** Test-output filter ΓÇö keeps summary tail and compresses verbose test runs. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface TestFilterOptions {
  /** Max lines to keep from the head (after the header block). Default: 10. */
  headLines: number;
  /** Max lines to keep from the tail ΓÇö the summary is the most valuable part.
   * Default: 40. */
  tailLines: number;
}

const DEFAULT_OPTS: TestFilterOptions = { headLines: 10, tailLines: 40 };

/** Filter test output: prioritize the tail summary (pass/fail/snapshot counts,
 * timing) over verbose per-test output. Only applies to successful runs
 * (non-zero exit is already handled by error-aware passthrough). */
export function testFilter(
  formatted: string,
  opts: TestFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  // Test output benefits from a larger tail window than generic ΓÇö the summary
  // block at the end (files, tests, pass/fail, snapshots, time) is the most
  // actionable part. Delegate to genericFilter with test-specific defaults.
  return genericFilter(formatted, opts);
}
