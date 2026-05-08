/** Git-show filter ΓÇö preserves commit header + compresses the diff body. */

import { type FilterResult, genericFilter } from "./generic.js";
import { gitDiffFilter } from "./git-diff.js";

export interface GitShowFilterOptions {
  /** Max diff lines per file section (head). Default: 15. */
  fileHeadLines: number;
  /** Max diff lines from the tail. Default: 20. */
  tailLines: number;
}

const DEFAULT_OPTS: GitShowFilterOptions = { fileHeadLines: 15, tailLines: 20 };

/** Filter git show output: preserve commit header, compress the diff body
 *  using the same logic as git-diff filter. */
export function gitShowFilter(
  formatted: string,
  opts: GitShowFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the tool header block ("$ git show ΓÇª" + "[exit N]").
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith("$ ") || ln.startsWith("[") || ln === "") {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  const toolHeader = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd);

  if (body.length === 0) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // The commit header is everything before "diff --git" or "diff --cc".
  // It includes: commit hash, Author, Date, and commit message.
  let commitHeaderEnd = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i]!.startsWith("diff --git") || body[i]!.startsWith("diff --cc")) {
      commitHeaderEnd = i;
      break;
    }
  }

  // If no diff found, it's a non-diff show (e.g. `git show --stat` or blob).
  // Fall through to generic filter.
  if (commitHeaderEnd === 0) {
    return genericFilter(formatted, { headLines: 40, tailLines: 20 });
  }

  const commitHeader = body.slice(0, commitHeaderEnd);
  const diffBody = body.slice(commitHeaderEnd);

  // Reconstruct a synthetic formatted string for the diff filter:
  // tool header + diff body (without the commit header).
  const synthetic = [...toolHeader, ...diffBody].join("\n");
  const diffResult = gitDiffFilter(synthetic, {
    fileHeadLines: opts.fileHeadLines,
    tailLines: opts.tailLines,
  });

  // If the diff filter didn't truncate, just return the original.
  if (!diffResult.truncated) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // Reattach the commit header to the filtered diff output.
  // Replace the synthetic tool header with the real one + commit header.
  const filteredLines = diffResult.output.split("\n");
  // Find where the diff body starts in the filtered output (after tool header).
  let filteredToolHeaderEnd = 0;
  for (let i = 0; i < filteredLines.length; i++) {
    const ln = filteredLines[i]!;
    if (ln.startsWith("$ ") || ln.startsWith("[") || ln === "") {
      filteredToolHeaderEnd = i + 1;
    } else {
      break;
    }
  }

  const result = [
    ...filteredLines.slice(0, filteredToolHeaderEnd),
    ...commitHeader,
    ...filteredLines.slice(filteredToolHeaderEnd),
  ].join("\n");

  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}
