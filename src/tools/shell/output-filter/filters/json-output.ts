/** JSON output filter ΓÇö detects JSON output and compresses structured data. */

import { type FilterResult, genericFilter } from "./generic.js";

export interface JsonFilterOptions {
  /** Max number of object keys to show per object. Default: 10. */
  maxKeysPerObject: number;
  /** Max number of array items to show per array. Default: 5. */
  maxArrayItems: number;
  /** Max nesting depth to expand. Default: 3. */
  maxDepth: number;
  /** Max string value length before truncation. Default: 80. */
  maxValueLength: number;
}

const DEFAULT_OPTS: JsonFilterOptions = {
  maxKeysPerObject: 10,
  maxArrayItems: 5,
  maxDepth: 3,
  maxValueLength: 80,
};

/** Filter JSON output: compress structured data while preserving key names and structure. */
export function jsonFilter(
  formatted: string,
  opts: JsonFilterOptions = DEFAULT_OPTS,
): FilterResult {
  const rawChars = formatted.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const lines = formatted.split("\n");

  // Identify the tool header block.
  // Only match "[exit N]" or "[killed ...]" markers, not JSON array brackets.
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    if (ln.startsWith("$ ") || /^\[(exit|killed)/.test(ln) || ln === "") {
      headerEnd = i + 1;
    } else {
      break;
    }
  }

  const toolHeader = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd).join("\n");

  if (body.trim().length === 0) {
    return { output: formatted, rawChars, filteredChars: rawChars, truncated: false };
  }

  // Try to parse the body as JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not valid JSON ΓÇö fall through to generic filter.
    return genericFilter(formatted);
  }

  // Compress the parsed JSON.
  const compressed = compressValue(parsed, 0, opts);
  const result = [...toolHeader, compressed].join("\n");

  const truncated = result.length < rawChars;
  return { output: result, rawChars, filteredChars: result.length, truncated };
}

/** Compress a parsed JSON value recursively. */
function compressValue(value: unknown, depth: number, opts: JsonFilterOptions): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "string") {
    if (value.length <= opts.maxValueLength) return JSON.stringify(value);
    const truncated = value.slice(0, opts.maxValueLength);
    return `${JSON.stringify(truncated)}ΓÇª [${value.length} chars]`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (depth >= opts.maxDepth) return `[ΓÇª ${value.length} items]`;

    const items = value
      .slice(0, opts.maxArrayItems)
      .map((item) => compressValue(item, depth + 1, opts));
    const omitted = value.length - opts.maxArrayItems;
    if (omitted > 0) {
      items.push(`ΓÇª +${omitted} more items`);
    }
    const indent = "  ".repeat(depth + 1);
    const inner = items.join(`,\n${indent}`);
    const openBracket = "[";
    const closeBracket = `${"  ".repeat(depth)}]`;
    return `${openBracket}\n${indent}${inner}\n${closeBracket}`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return "{}";
    if (depth >= opts.maxDepth) return `{ΓÇª ${keys.length} keys}`;

    const shownKeys = keys.slice(0, opts.maxKeysPerObject);
    const omittedKeys = keys.length - opts.maxKeysPerObject;

    const entries = shownKeys.map((key) => {
      const compressedVal = compressValue(obj[key], depth + 1, opts);
      return `${"  ".repeat(depth + 1)}${JSON.stringify(key)}: ${compressedVal}`;
    });

    if (omittedKeys > 0) {
      entries.push(
        `${"  ".repeat(depth + 1)}ΓÇª +${omittedKeys} more keys: [${keys.slice(opts.maxKeysPerObject).join(", ")}]`,
      );
    }

    const openBrace = "{";
    const closeBrace = `${"  ".repeat(depth)}}`;
    return `${openBrace}\n${entries.join(",\n")}\n${closeBrace}`;
  }

  return String(value);
}
