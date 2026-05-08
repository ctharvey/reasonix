/** Build-output filter ΓÇö compresses verbose compilation output. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface BuildFilterOptions {
  /** Max lines to keep from the head. Default: 15. */
  headLines: number;
  /** Max lines to keep from the tail ΓÇö final build status is most valuable.
   * Default: 25. */
  tailLines: number;
}

const DEFAULT_OPTS: BuildFilterOptions = { headLines: 15, tailLines: 25 };

/** Filter build output: successful builds are mostly noise (compiling dep ΓÇª),
 * so use a smaller window. Error output is already handled by error-aware
 * passthrough (non-zero exit ΓåÆ full output). */
export function buildFilter(
  formatted: string,
  opts: BuildFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  return genericFilter(formatted, opts);
}
