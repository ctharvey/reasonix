/** Typecheck-output filter ΓÇö compresses verbose typecheck output on success. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface TypecheckFilterOptions {
  /** Max lines to keep from the head. Default: 15. */
  headLines: number;
  /** Max lines to keep from the tail. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: TypecheckFilterOptions = { headLines: 15, tailLines: 30 };

/** Filter typecheck output: mirrors lint ΓÇö on success, output is short; on
 * failure, error-aware passthrough preserves the full diagnostics. */
export function typecheckFilter(
  formatted: string,
  opts: TypecheckFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  return genericFilter(formatted, { headLines: opts.headLines, tailLines: opts.tailLines });
}
