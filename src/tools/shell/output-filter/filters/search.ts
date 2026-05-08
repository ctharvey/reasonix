/** Search result filter ΓÇö compresses grep/rg/findstr/ag/ack output with match grouping. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface SearchFilterOptions {
  /** Max matches to keep per file before summarizing. Default: 5. */
  maxMatchesPerFile: number;
  /** Max files to show before summarizing the rest. Default: 15. */
  maxFiles: number;
  /** Max lines from head for fallthrough generic filter. Default: 20. */
  headLines: number;
  /** Max lines from tail for fallthrough generic filter. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: SearchFilterOptions = {
  maxMatchesPerFile: 5,
  maxFiles: 15,
  headLines: 20,
  tailLines: 30,
};

interface FileGroup {
  path: string;
  lines: string[];
}

/** Parse search output into per-file groups.
 *  Handles formats: "path:line", "path:line:col:", "path-line:",
 *  and rg's --heading format (path followed by indented match lines). */
function groupByFile(bodyLines: string[]): FileGroup[] {
  const groups: FileGroup[] = [];
  let currentPath = "";
  let currentLines: string[] = [];

  // Heading-mode: path on its own line, then indented match lines.
  // Also handles ripgrep --heading format.
  const HEADING_PATH_RE = /^[^\s:][^\s]*[^\s:](?::?$)/;
  // Inline-mode: path:lineno:content or path:content
  const INLINE_PATH_RE = /^([^:\s]+?):(\d+[:-])/;

  for (const ln of bodyLines) {
    const trimmed = ln.trim();

    if (trimmed === "") {
      if (currentPath) {
        currentLines.push(ln);
      }
      continue;
    }

    // Check for heading-mode path (rg --heading): line is just a path,
    // possibly with trailing colon.
    if (HEADING_PATH_RE.test(trimmed) && !INLINE_PATH_RE.test(trimmed)) {
      // If the line looks like just a path (no line number after it),
      // start a new group.
      const candidatePath = trimmed.replace(/:$/, "");
      // Heuristic: if there's no colon-number pattern, treat as heading path.
      if (!/\d/.test(trimmed) || trimmed.endsWith(":")) {
        if (currentPath && currentLines.length > 0) {
          groups.push({ path: currentPath, lines: [...currentLines] });
        }
        currentPath = candidatePath;
        currentLines = [];
        continue;
      }
    }

    // Check for inline path:number:content
    const inlineMatch = INLINE_PATH_RE.exec(trimmed);
    if (inlineMatch) {
      const filePath = inlineMatch[1]!;
      if (filePath !== currentPath) {
        if (currentPath && currentLines.length > 0) {
          groups.push({ path: currentPath, lines: [...currentLines] });
        }
        currentPath = filePath;
        currentLines = [ln];
      } else {
        currentLines.push(ln);
      }
      continue;
    }

    // Fallback: line without recognizable path pattern.
    // If we have a current group, add to it; otherwise, create an "ungrouped" group.
    if (currentPath) {
      currentLines.push(ln);
    } else {
      // Start an ungrouped pseudo-group.
      currentPath = "(unsorted)";
      currentLines = [ln];
    }
  }

  if (currentPath && currentLines.length > 0) {
    groups.push({ path: currentPath, lines: [...currentLines] });
  }

  return groups;
}

/** Compress matches within a single file group.
 *  Keeps up to maxMatchesPerFile match lines; summarizes the rest. */
function compressFileGroup(group: FileGroup, maxMatches: number): string[] {
  if (group.lines.length <= maxMatches) {
    return group.lines;
  }

  const kept = group.lines.slice(0, maxMatches);
  const omitted = group.lines.length - maxMatches;
  return [...kept, `  [ΓÇª ${omitted} more matches in ${group.path} ΓÇª]`];
}

/** Filter search command output (grep, rg, findstr, ag, ack).
 *  Groups matches by file, caps repeated matches, and summarizes omitted matches. */
export function searchFilter(
  formatted: string,
  opts: SearchFilterOptions = DEFAULT_OPTS,
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
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // If body doesn't look like search output (no colons with line numbers),
  // fall through to generic filter.
  const hasSearchPattern = body.some((ln) => {
    const t = ln.trim();
    return t !== "" && /[^:\s]+:\d+[:-]/.test(t);
  });

  if (!hasSearchPattern) {
    // Could be a "no matches" message or unstructured output.
    // Check for common "no match" outputs.
    const nonBlank = body.filter((ln) => ln.trim() !== "");
    if (nonBlank.length <= 3) {
      return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
    }
    return genericFilter(formatted, { headLines: opts.headLines, tailLines: opts.tailLines });
  }

  // Group by file and compress.
  const groups = groupByFile(body);

  if (groups.length === 0) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // If few groups and few lines, pass through without filtering.
  const totalMatchLines = groups.reduce((sum, g) => sum + g.lines.length, 0);
  const anyFileExceeds = groups.some((g) => g.lines.length > opts.maxMatchesPerFile);
  if (
    groups.length <= opts.maxFiles &&
    totalMatchLines <= opts.maxFiles * opts.maxMatchesPerFile &&
    !anyFileExceeds
  ) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // Compress each group's matches.
  const compressedGroups = groups
    .slice(0, opts.maxFiles)
    .map((g) => compressFileGroup(g, opts.maxMatchesPerFile));

  const parts: string[] = [...header];

  for (let i = 0; i < compressedGroups.length; i++) {
    const group = groups[i]!;
    const compressed = compressedGroups[i]!;
    if (i > 0 && group.path !== groups[i - 1]!.path) {
      parts.push(""); // blank line between file groups
    }
    parts.push(...compressed);
  }

  // Summarize omitted files.
  if (groups.length > opts.maxFiles) {
    const omittedFiles = groups.length - opts.maxFiles;
    const omittedMatches = groups.slice(opts.maxFiles).reduce((sum, g) => sum + g.lines.length, 0);
    parts.push("", `[ΓÇª ${omittedFiles} more files with ${omittedMatches} matches omitted ΓÇª]`);
  }

  const result = parts.join("\n");
  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}
