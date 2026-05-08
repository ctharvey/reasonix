/** Filesystem listing filter ΓÇö compresses ls/dir/tree/find output with semantic awareness. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface FsListingFilterOptions {
  /** Max entries to keep when a directory listing exceeds the cap. Default: 50. */
  maxEntries: number;
  /** Max lines from head for fallthrough generic filter. Default: 20. */
  headLines: number;
  /** Max lines from tail for fallthrough generic filter. Default: 30. */
  tailLines: number;
}

const DEFAULT_OPTS: FsListingFilterOptions = {
  maxEntries: 50,
  headLines: 20,
  tailLines: 30,
};

/** File basename patterns that are likely important to preserve even in truncated output. */
const IMPORTANT_PATTERNS: readonly RegExp[] = [
  /^package\.json$/i,
  /^tsconfig\.json$/i,
  /^Cargo\.toml$/i,
  /^pyproject\.toml$/i,
  /^go\.mod$/i,
  /^Makefile$/i,
  /^Dockerfile$/i,
  /^docker-compose/i,
  /^\.env/i,
  /^README/i,
  /^CHANGELOG/i,
  /^LICENSE/i,
  /^\.gitignore$/i,
  /^\.gitmodules$/i,
  /^src$/i,
  /^lib$/i,
  /^test/i,
  /^spec/i,
  /^__tests__$/i,
  /^src\//i,
  /^lib\//i,
];

function isImportantEntry(entry: string): boolean {
  const basename = entry.replace(/\/$/, "").split("/").pop() ?? entry;
  return IMPORTANT_PATTERNS.some((p) => p.test(basename));
}

/** Filter filesystem listing output (ls, dir, tree, find).
 *  Preserves header lines, keeps important files, caps huge listings,
 *  and groups omitted entries by count. */
export function fsListingFilter(
  formatted: string,
  opts: FsListingFilterOptions = DEFAULT_OPTS,
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

  if (body.length === 0) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // Detect tree-style output: lines with box-drawing characters (Γö£ΓöÇΓöÇ ΓööΓöÇΓöÇ Γöé).
  const treeStyle = body.some((ln) => /^[ΓöéΓö£ΓööΓöÇΓöÉΓöÿΓöñ]/.test(ln) || /\s[ΓöéΓö£ΓööΓöÇΓöÉΓöÿΓöñ]/.test(ln));

  // Detect find-style output: one path per line, no special characters.
  // Find output is one-path-per-line ΓÇö just a list of absolute or relative paths.
  // We handle it the same way as ls output.

  // Detect error lines (e.g. "Permission denied", "No such file").
  const errorLines: string[] = [];
  const contentLines: string[] = [];
  for (const ln of body) {
    const trimmed = ln.trim();
    if (
      trimmed === "" ||
      /Permission denied/i.test(trimmed) ||
      /No such file/i.test(trimmed) ||
      /not found/i.test(trimmed) ||
      /cannot access/i.test(trimmed) ||
      /cannot open/i.test(trimmed)
    ) {
      // Keep blank lines and error lines in their original position via contentLines
      // so they don't get separated from context.
      contentLines.push(ln);
    } else {
      contentLines.push(ln);
    }
  }

  // Error lines that should always be preserved regardless of truncation.
  const preservedErrors = contentLines.filter((ln) => {
    const t = ln.trim();
    return (
      /Permission denied/i.test(t) ||
      /No such file/i.test(t) ||
      /cannot access/i.test(t) ||
      /cannot open/i.test(t)
    );
  });

  // For tree-style, use generic filter ΓÇö tree chars make semantic grouping unreliable.
  if (treeStyle) {
    return genericFilter(formatted, { headLines: opts.headLines, tailLines: opts.tailLines });
  }

  // For short listings (under cap), pass through.
  const nonBlank = contentLines.filter((ln) => ln.trim() !== "");
  if (nonBlank.length <= opts.maxEntries) {
    const result = [...header, ...contentLines].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  // Large listing: separate important entries from regular entries.
  const important: string[] = [];
  const regular: string[] = [];
  const seenImportant = new Set<string>();

  for (const ln of contentLines) {
    const trimmed = ln.trim();
    if (trimmed === "") {
      regular.push(ln);
      continue;
    }
    if (isImportantEntry(trimmed) && !seenImportant.has(trimmed)) {
      important.push(ln);
      seenImportant.add(trimmed);
    } else {
      regular.push(ln);
    }
  }

  // Count how many regular entries to keep from head and tail.
  const maxRegular = opts.maxEntries - important.length - preservedErrors.length;
  const headRegular = Math.max(0, Math.ceil(maxRegular / 2));
  const tailRegular = Math.max(0, maxRegular - headRegular);

  const regularNonBlank = regular.filter((ln) => ln.trim() !== "");
  const regularBlanks = regular.filter((ln) => ln.trim() === "");

  if (regularNonBlank.length <= maxRegular) {
    // Fits after pulling out important entries ΓÇö recombine.
    const result = [...header, ...contentLines].join("\n");
    return { output: result, rawChars, filteredChars: result.length, truncated: false };
  }

  const keptHead = regularNonBlank.slice(0, headRegular);
  const keptTail = regularNonBlank.slice(-tailRegular);
  const omitted = regularNonBlank.length - headRegular - tailRegular;

  const parts: string[] = [...header];
  if (important.length > 0) {
    parts.push(...important, "");
  }
  parts.push(...keptHead);
  parts.push("", `[ΓÇª ${omitted} entries omitted ΓÇª]`, "");
  parts.push(...keptTail);
  // Append error lines at the bottom so they're always visible.
  for (const err of preservedErrors) {
    if (!parts.includes(err)) {
      parts.push(err);
    }
  }

  const result = parts.join("\n");
  return { output: result, rawChars, filteredChars: result.length, truncated: true };
}
