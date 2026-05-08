/** Log-output filter ΓÇö compresses background job output with dedup and readiness preservation. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface LogFilterOptions {
  /** Max lines to keep from the head (readiness signals, startup). Default: 15. */
  headLines: number;
  /** Max lines to keep from the tail (recent output, errors). Default: 30. */
  tailLines: number;
  /** Max consecutive identical lines before collapsing. Default: 3. */
  maxConsecutiveDupes: number;
}

const DEFAULT_OPTS: LogFilterOptions = {
  headLines: 15,
  tailLines: 30,
  maxConsecutiveDupes: 3,
};

/** Patterns that indicate an important line ΓÇö readiness signals, errors, warnings. */
const IMPORTANT_PATTERNS: ReadonlyArray<RegExp> = [
  // Readiness / server banners
  /\blistening on\b/i,
  /\blocal:\s+https?:\/\//i,
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b/i,
  /\b(?:ready|server started|started server|app listening|compiled successfully)\b/i,
  /\bbuild complete(?:d)?\b/i,
  /\bready in \d+/i,
  /\bstartup (?:complete|finished)\b/i,
  // Errors and warnings
  /\b(error|fatal|critical|panic|abort|segfault|core dump)\b/i,
  /\b(warn(?:ing)?|deprecated|caution)\b/i,
  /\b(fail(?:ed|ure)?|exception|unhandled|uncaught)\b/i,
];

/** Collapse consecutive duplicate lines in a log body.
 *  Keeps up to `maxDupes` copies of any run of identical lines, then
 *  inserts a "[ΓÇª N repeated lines ΓÇª]" summary. */
function collapseDuplicateRuns(lines: string[], maxDupes: number): string[] {
  if (maxDupes <= 0) return lines;

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const current = lines[i]!;
    // Count how many consecutive lines match the current one.
    let runLen = 1;
    while (i + runLen < lines.length && lines[i + runLen] === current) {
      runLen++;
    }
    if (runLen <= maxDupes) {
      for (let j = 0; j < runLen; j++) out.push(current);
    } else {
      for (let j = 0; j < maxDupes; j++) out.push(current);
      const omitted = runLen - maxDupes;
      out.push(`[ΓÇª ${omitted} repeated lines omitted ΓÇª]`);
    }
    i += runLen;
  }
  return out;
}

/** Extract important lines from the body: readiness signals, errors, warnings.
 *  Returns lines that match IMPORTANT_PATTERNS, preserving their order. */
function extractImportantLines(lines: string[]): string[] {
  return lines.filter((ln) => IMPORTANT_PATTERNS.some((re) => re.test(ln)));
}

/** Filter log output from background jobs with dedup and readiness preservation. */
export function logFilter(formatted: string, opts: LogFilterOptions = DEFAULT_OPTS): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the job header block: lines starting with `[job` or `$ ` at top.
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith("[job") || ln.startsWith("$ ") || ln === "") {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  const header = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd);

  // Collapse duplicate runs in the body.
  const dedupedBody = collapseDuplicateRuns(body, opts.maxConsecutiveDupes);

  // If the body is short enough after dedup, no truncation needed.
  if (dedupedBody.length <= opts.headLines + opts.tailLines) {
    const result = [...header, ...dedupedBody].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  // Extract important lines that must not be lost.
  const importantLines = extractImportantLines(dedupedBody);

  // Apply head+tail window.
  const head = dedupedBody.slice(0, opts.headLines);
  const tail = dedupedBody.slice(-opts.tailLines);
  const windowSet = new Set([...head, ...tail]);

  // Find important lines that fell outside the window.
  const lostImportant = importantLines.filter((ln) => !windowSet.has(ln));

  const omitted = dedupedBody.length - opts.headLines - opts.tailLines;
  const marker = `[ΓÇª ${omitted} lines omitted ΓÇª]`;

  let result: string;
  if (lostImportant.length > 0) {
    // Insert a Warnings/Errors section between the omission marker and the tail.
    const importantSection = ["", "Important lines from omitted output:", ...lostImportant];
    result = [...header, ...head, "", marker, ...importantSection, "", ...tail].join("\n");
  } else {
    result = [...header, ...head, "", marker, "", ...tail].join("\n");
  }

  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}
