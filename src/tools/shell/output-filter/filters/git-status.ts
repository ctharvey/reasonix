/** Git-status filter ΓÇö keeps short-status intact, compresses long format. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface GitStatusFilterOptions {
  /** Max lines to keep from head for short-format. Default: 50. */
  headLines: number;
  /** Max lines to keep from tail for short-format. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: GitStatusFilterOptions = { headLines: 50, tailLines: 30 };

/** Filter git status output. Short-format (-s) is compact enough to pass
 * through; long-format falls back to generic head/tail. */
export function gitStatusFilter(
  formatted: string,
  opts: GitStatusFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const lines = formatted.split("\n");

  // Detect short-format: body lines start with XY status codes.
  // Short-format lines match: "XY path" or "XY path -> path"
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith("$ ") || ln.startsWith("[") || ln === "") {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  const body = lines.slice(headerEnd);
  if (body.length === 0) {
    return {
      output: formatted,
      rawChars: formatted.length,
      filteredChars: formatted.length,
      truncated: false,
    };
  }

  // If the first non-blank body line looks like short-format
  // (2-char status code + space + path), pass through as-is.
  const nonBlank = body.find((ln) => ln.trim() !== "");
  if (nonBlank && /^[A-Z? !]{2}\s/.test(nonBlank)) {
    // Short format ΓÇö already compact, but apply generic filter if very long.
    return genericFilter(formatted, { headLines: opts.headLines, tailLines: opts.tailLines });
  }

  // Long format (shows "Changes to be committed:", etc.) ΓÇö generic filter.
  return genericFilter(formatted);
}
