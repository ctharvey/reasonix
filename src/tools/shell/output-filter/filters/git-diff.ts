/** Git-diff filter ΓÇö preserves stat summary + per-file diff headers with head/tail. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface GitDiffFilterOptions {
  /** Max diff lines per file section (head). Default: 15. */
  fileHeadLines: number;
  /** Max diff lines from the tail of the entire diff. Default: 20. */
  tailLines: number;
}

const DEFAULT_OPTS: GitDiffFilterOptions = { fileHeadLines: 15, tailLines: 20 };

/** Filter git diff output: keep stat block + per-file headers + head/tail of diff body. */
export function gitDiffFilter(
  formatted: string,
  opts: GitDiffFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the header block (tool header: "$ git diff ΓÇª" + "[exit N]").
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

  // Find the stat block ΓÇö starts after header, contains "|" pipe column or
  // the "N files changed" summary line. Stat lines look like:
  //   src/foo.ts |  12 ++++----
  //   3 files changed, 5 insertions(+), 7 deletions(-)
  const { statLines, diffLines } = splitStatAndDiff(body);

  // If there's no diff body (stat-only output, e.g. "git diff --stat"), keep
  // stat verbatim and apply generic head/tail to any trailing content.
  if (diffLines.length === 0) {
    return genericFilter(formatted);
  }

  // If the diff body is short enough, return as-is with stat prepended.
  const combinedDiffLines = [...statLines, ...diffLines];
  if (combinedDiffLines.length <= opts.fileHeadLines + opts.tailLines + statLines.length) {
    const result = [...header, ...combinedDiffLines].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  // Compress: keep stat + per-file "diff --git" headers + head/tail.
  const compressed = compressDiffBody(diffLines, opts);
  const result = [...header, ...statLines, ...compressed].join("\n");
  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}

interface SplitResult {
  statLines: string[];
  diffLines: string[];
}

/** Split body into stat-block lines and diff-content lines. */
function splitStatAndDiff(body: string[]): SplitResult {
  const statLines: string[] = [];
  const diffLines: string[] = [];
  let pastStat = false;

  for (const line of body) {
    if (!pastStat) {
      // Stat lines contain "|" or are the summary line, or are blank within
      // the stat block. The stat block ends at the first "diff --git" line.
      if (line.startsWith("diff --git") || line.startsWith("diff --cc")) {
        pastStat = true;
        diffLines.push(line);
      } else {
        statLines.push(line);
      }
    } else {
      diffLines.push(line);
    }
  }

  // If there are no stat lines at all, that's fine ΓÇö some diffs have no stat.
  return { statLines, diffLines };
}

/** Compress diff body: keep per-file headers, show head/tail per section. */
function compressDiffBody(diffLines: string[], opts: GitDiffFilterOptions): string[] {
  // Split into file sections by "diff --git" boundaries.
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of diffLines) {
    if (line.startsWith("diff --git") || line.startsWith("diff --cc")) {
      if (current.length > 0) sections.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);

  const out: string[] = [];
  let totalOmitted = 0;

  for (const section of sections) {
    if (section.length <= opts.fileHeadLines) {
      // Short section ΓÇö include entirely.
      out.push(...section);
    } else {
      // Keep header lines (diff --git, index, ---, +++, @@ ΓÇª @@) then head.
      const headerLines: string[] = [];
      let bodyStart = 0;
      for (let i = 0; i < section.length; i++) {
        const ln = section[i]!;
        if (
          ln.startsWith("diff --git") ||
          ln.startsWith("diff --cc") ||
          ln.startsWith("index ") ||
          ln.startsWith("--- ") ||
          ln.startsWith("+++ ") ||
          ln.startsWith("@@") ||
          ln.startsWith("old mode") ||
          ln.startsWith("new mode") ||
          ln.startsWith("similarity index") ||
          ln.startsWith("rename from") ||
          ln.startsWith("rename to") ||
          ln.startsWith("copy from") ||
          ln.startsWith("copy to")
        ) {
          headerLines.push(ln);
          bodyStart = i + 1;
        } else {
          break;
        }
      }

      const sectionBody = section.slice(bodyStart);
      const headCount = Math.max(0, opts.fileHeadLines - headerLines.length);
      if (sectionBody.length <= headCount) {
        out.push(...section);
      } else {
        const head = sectionBody.slice(0, headCount);
        const omitted = sectionBody.length - headCount;
        totalOmitted += omitted;
        out.push(
          ...headerLines,
          ...head,
          "",
          `[ΓÇª ${omitted} lines omitted in this file ΓÇª]`,
          "",
        );
      }
    }
  }

  // Append tail from the very end of the entire diff body.
  if (opts.tailLines > 0 && diffLines.length > opts.fileHeadLines) {
    const tail = diffLines.slice(-opts.tailLines);
    // Avoid duplicating lines already in out.
    const lastOut = out[out.length - 1];
    const firstTail = tail[0];
    if (lastOut !== firstTail) {
      out.push("", "ΓöÇΓöÇ tail ΓöÇΓöÇ", ...tail);
    }
  }

  return out;
}
