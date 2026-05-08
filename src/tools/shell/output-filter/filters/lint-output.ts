/** Lint-output filter ΓÇö compresses verbose lint output on success. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface LintFilterOptions {
  /** Max lines to keep from the head. Default: 15. */
  headLines: number;
  /** Max lines to keep from the tail. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: LintFilterOptions = { headLines: 15, tailLines: 30 };

/** Filter lint output: on success (exit 0), lint output is typically short
 * and actionable already. On failure, error-aware passthrough preserves
 * the full output. Use generic with a generous tail for any diagnostics. */
export function lintFilter(
  formatted: string,
  opts: LintFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  return genericFilter(formatted, { headLines: opts.headLines, tailLines: opts.tailLines });
}
