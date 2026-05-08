/** Git-log filter ΓÇö keeps oneline format compact with head/tail windowing. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface GitLogFilterOptions {
  /** Max oneline commit entries to keep from head. Default: 25. */
  headCommits: number;
  /** Max oneline commit entries to keep from tail. Default: 15. */
  tailCommits: number;
}

const DEFAULT_OPTS: GitLogFilterOptions = { headCommits: 25, tailCommits: 15 };

/** Filter git log output: for oneline format, compress with head/tail windowing. */
export function gitLogFilter(
  formatted: string,
  opts: GitLogFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the header block.
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith("$ ") || ln.startsWith("[") || ln === "") {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  const header = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd);

  if (body.length === 0) {
    const result = formatted;
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  // Detect oneline format: each non-blank body line starts with a hex hash.
  // Oneline lines match: <7-40 hex chars><space><message>
  const isOneline = body.every((ln) => ln.trim() === "" || /^[0-9a-f]{6,40}\s/.test(ln));

  if (!isOneline) {
    // Non-oneline format (full log) ΓÇö fall back to generic filter.
    return genericFilter(formatted);
  }

  // Filter blank lines for counting.
  const commitLines = body.filter((ln) => ln.trim() !== "");

  if (commitLines.length <= opts.headCommits + opts.tailCommits) {
    // Fits ΓÇö return as-is.
    const result = [...header, ...body].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  // Compress: head commits + omission marker + tail commits.
  const nonBlankHead = commitLines.slice(0, opts.headCommits);
  const nonBlankTail = commitLines.slice(-opts.tailCommits);
  const omitted = commitLines.length - opts.headCommits - opts.tailCommits;
  const marker = `[ΓÇª ${omitted} commits omitted ΓÇª]`;
  const result = [...header, ...nonBlankHead, "", marker, "", ...nonBlankTail].join("\n");
  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}
