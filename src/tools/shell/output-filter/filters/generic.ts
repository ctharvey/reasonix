/** Generic head+tail filter ΓÇö applies to all command categories as a baseline. */

export interface GenericFilterOptions {
  /** Max lines to keep from the head (after the header block). Default: 20. */
  headLines: number;
  /** Max lines to keep from the tail. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: GenericFilterOptions = { headLines: 20, tailLines: 30 };

export interface FilterResult {
  output: string;
  rawChars: number;
  filteredChars: number;
  truncated: boolean;
}

/** Apply generic head+tail windowing with collapsed blanks and omission marker. */
export function genericFilter(
  formatted: string,
  opts: GenericFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the header block: lines starting with "$ " or "[" at the top.
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
  const collapsedBody = collapseBlankLines(body);

  // No truncation needed if body fits within the window.
  if (collapsedBody.length <= opts.headLines + opts.tailLines) {
    const result = [...header, ...collapsedBody].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  const head = collapsedBody.slice(0, opts.headLines);
  const tail = collapsedBody.slice(-opts.tailLines);
  const omitted = collapsedBody.length - opts.headLines - opts.tailLines;
  const marker = `[ΓÇª ${omitted} lines omitted ΓÇª]`;

  const result = [...header, ...head, "", marker, "", ...tail].join("\n");
  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}

/** Collapse runs of 2+ blank lines into a single blank line. */
function collapseBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank && prevBlank) continue;
    out.push(line);
    prevBlank = isBlank;
  }
  return out;
}
