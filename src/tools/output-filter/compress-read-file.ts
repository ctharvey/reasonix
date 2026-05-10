/** Compressor for read_file results: symbol-preserving import collapse, CSS rule dedup, smart comment threshold (10+ lines, JSDoc-aware), blank line compression. */

import type { FilterResult } from "../shell/output-filter/filters/generic.js";

export interface ReadFileCompressOptions {
  /** Collapse consecutive import lines into a condensed summary. Default: true. */
  importCollapse?: boolean;
  /** Collapse consecutive CSS rules sharing the same property names. Default: true. */
  cssRuleCollapse?: boolean;
  /** Maximum consecutive blank lines to preserve. Default: 1. */
  blankLineMax?: number;
  /** Minimum lines in a comment block before collapsing. Default: 10. */
  commentThreshold?: number;
}

const DEFAULT_OPTS: Required<ReadFileCompressOptions> = {
  importCollapse: true,
  cssRuleCollapse: true,
  blankLineMax: 1,
  commentThreshold: 10,
};

/** JSDoc tags that should be preserved even when collapsing comment blocks. */
const JSDOC_TAGS = new Set([
  "@param",
  "@returns",
  "@return",
  "@deprecated",
  "@example",
  "@see",
  "@throws",
  "@type",
  "@typedef",
  "@template",
  "@public",
  "@private",
  "@protected",
  "@readonly",
]);

/** Match an ES import line: import { A, B } from 'mod' / import X from 'mod' / import 'mod' */
const IMPORT_RE =
  /^import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"][^'"]+['"];?\s*$/;

/** Match a C-style import: const X = require('mod') / import X = require('mod') */
const CJS_IMPORT_RE =
  /^(?:const|let|var|import)\s+\w+\s*=\s*require\s*\(\s*['"][^'"]+['"]\s*\)\s*;?\s*$/;

/** Extract module path and symbols from an ES import line. */
function parseEsImport(
  line: string,
): { module: string; symbols: string[]; isType: boolean } | null {
  const typePrefix = line.startsWith("import type ");
  const cleaned = line.replace(/^import\s+type\s+/, "import ");

  // import { A, B as C } from 'mod'
  const namedMatch = cleaned.match(/^import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/);
  if (namedMatch) {
    const symbols = namedMatch[1]!
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter(Boolean);
    return { module: namedMatch[2]!, symbols, isType: typePrefix };
  }

  // import * as X from 'mod'
  const nsMatch = cleaned.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (nsMatch) {
    return { module: nsMatch[2]!, symbols: [`* as ${nsMatch[1]!}`], isType: typePrefix };
  }

  // import X from 'mod'
  const defMatch = cleaned.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (defMatch) {
    return { module: defMatch[2]!, symbols: [defMatch[1]!], isType: typePrefix };
  }

  // Side-effect import: import 'mod'
  const sideMatch = cleaned.match(/^import\s+['"]([^'"]+)['"]/);
  if (sideMatch) {
    return { module: sideMatch[1]!, symbols: [], isType: false };
  }

  return null;
}

/** Extract module path from a CJS require line. */
function parseCjsImport(line: string): { module: string; symbols: string[] } | null {
  const match = line.match(
    /^(?:const|let|var|import)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  );
  if (match) {
    return { module: match[2]!, symbols: [match[1]!] };
  }
  return null;
}

/** Collapse consecutive import lines into a condensed symbol-preserving summary.
 * Format: `// [N imports: mod1(sym1, sym2), mod2(sym3), mod3(side-effect)]` */
function collapseImports(lines: string[]): string[] {
  const result: string[] = [];
  let importBlock: { module: string; symbols: string[]; isType: boolean }[] = [];
  let blockStart = -1;

  const flushBlock = (): void => {
    if (importBlock.length === 0) return;

    // Single import — keep as-is (not worth collapsing).
    if (importBlock.length === 1 && result.length === blockStart) {
      // It's the first line in a block at the start — keep original.
      // But we've already parsed it; reconstruct instead.
    }

    const count = importBlock.length;
    const parts = importBlock.map((imp) => {
      if (imp.symbols.length === 0) return `${imp.module}(side-effect)`;
      const prefix = imp.isType ? "type " : "";
      return `${prefix}${imp.module}(${imp.symbols.join(", ")})`;
    });
    result.push(`// [${count} import${count > 1 ? "s" : ""}: ${parts.join(", ")}]`);
    importBlock = [];
    blockStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (IMPORT_RE.test(line)) {
      const parsed = parseEsImport(line);
      if (parsed) {
        if (importBlock.length === 0) blockStart = i;
        importBlock.push(parsed);
        continue;
      }
    }

    if (CJS_IMPORT_RE.test(line)) {
      const parsed = parseCjsImport(line);
      if (parsed) {
        if (importBlock.length === 0) blockStart = i;
        importBlock.push({ ...parsed, isType: false });
        continue;
      }
    }

    // Blank line between import groups — flush current block,
    // preserve the blank, then start a new block.
    if (line.trim() === "" && importBlock.length > 0) {
      flushBlock();
      result.push(line);
      continue;
    }

    // Non-import, non-blank — flush any pending import block.
    if (importBlock.length > 0) {
      flushBlock();
    }
    result.push(line);
  }

  // Flush trailing import block.
  if (importBlock.length > 0) {
    flushBlock();
  }

  return result;
}

/** Collapse runs of blank lines beyond the configured max. */
function collapseBlankLines(lines: string[], maxConsecutive: number): string[] {
  if (maxConsecutive <= 0) return lines;

  const result: string[] = [];
  let blankRun = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= maxConsecutive) {
        result.push(line);
      }
      continue;
    }
    blankRun = 0;
    result.push(line);
  }

  return result;
}

/** Detect if a comment block contains JSDoc tags that should be preserved. */
function hasJSDocTags(lines: string[]): boolean {
  return lines.some((line) => {
    const stripped = line
      .trim()
      .replace(/^\/\/\/?\s?/, "")
      .replace(/^\*\s?/, "");
    return JSDOC_TAGS.has(stripped.split(/\s/)[0] ?? "");
  });
}

/** Compress comment blocks above the threshold, preserving first/last lines
 * and any lines containing JSDoc tags. */
function compressCommentBlocks(lines: string[], threshold: number): string[] {
  if (threshold <= 0) return lines;

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Detect start of a comment block.
    const isComment =
      line.trimStart().startsWith("//") ||
      line.trimStart().startsWith("*") ||
      line.trimStart().startsWith("/*");

    if (!isComment) {
      result.push(line);
      i++;
      continue;
    }

    // Gather the entire contiguous comment block.
    const blockStart = i;
    const block: string[] = [];
    while (i < lines.length) {
      const cl = lines[i]!;
      const ct = cl.trimStart();
      if (ct.startsWith("//") || ct.startsWith("*") || ct.startsWith("/*")) {
        block.push(cl);
        i++;
      } else if (ct === "" && i + 1 < lines.length) {
        // Blank inside a block — check if next line continues comments.
        const next = lines[i + 1]!.trimStart();
        if (next.startsWith("//") || next.startsWith("*") || next.startsWith("/*")) {
          block.push(cl);
          i++;
          continue;
        }
        break;
      } else {
        break;
      }
    }

    // Only compress blocks above threshold that don't contain JSDoc tags.
    if (block.length >= threshold && !hasJSDocTags(block)) {
      result.push(block[0]!);
      result.push(`// [${block.length - 2} comment lines omitted]`);
      result.push(block[block.length - 1]!);
    } else {
      result.push(...block);
    }
  }

  return result;
}

/** Strip trailing blank lines from the result. */
function stripTrailingBlanks(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  return lines.slice(0, end);
}

/** Match a CSS property line inside a rule block: `  property: value;` */
const CSS_PROP_RE = /^\s+([\w-]+)\s*:/;

/** Match a CSS rule closing brace. */
const CSS_CLOSE_RE = /^\s*}\s*$/;

/** Match a CSS selector line (opens a rule block): starts with non-whitespace
 *  and ends with `{`, or is a standalone `{` after a selector on the prior line. */
const CSS_SELECTOR_RE = /^[^/\s][^/{]*\{\s*$/;

/** Collapse consecutive CSS rule blocks that share the same property names.
 *  Preserves the first and last rules in a group, replaces middle ones with a summary. */
function collapseCssBlocks(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Look for a CSS selector line.
    if (!CSS_SELECTOR_RE.test(lines[i]!)) {
      result.push(lines[i]!);
      i++;
      continue;
    }

    // Gather the full rule block: selector + properties + closing brace.
    const blockStart = i;
    const block: string[] = [lines[i]!];
    i++;
    while (i < lines.length && !CSS_CLOSE_RE.test(lines[i]!)) {
      block.push(lines[i]!);
      i++;
    }
    if (i < lines.length) {
      block.push(lines[i]!); // closing brace
      i++;
    }

    // Extract the property names from this block (not values — for grouping).
    const props = block
      .map((l) => {
        const m = CSS_PROP_RE.exec(l);
        return m ? m[1]! : null;
      })
      .filter((p): p is string => p !== null);
    const propKey = props.join("|");

    // Look ahead for consecutive blocks with the same property signature.
    const group: { block: string[]; propKey: string }[] = [{ block, propKey }];
    while (i < lines.length && CSS_SELECTOR_RE.test(lines[i]!)) {
      const nextBlock: string[] = [lines[i]!];
      i++;
      while (i < lines.length && !CSS_CLOSE_RE.test(lines[i]!)) {
        nextBlock.push(lines[i]!);
        i++;
      }
      if (i < lines.length) {
        nextBlock.push(lines[i]!);
        i++;
      }
      const nextProps = nextBlock
        .map((l) => {
          const m = CSS_PROP_RE.exec(l);
          return m ? m[1]! : null;
        })
        .filter((p): p is string => p !== null);
      const nextKey = nextProps.join("|");
      if (nextKey === propKey) {
        group.push({ block: nextBlock, propKey: nextKey });
      } else {
        // Different property signature — push the block back and stop grouping.
        // Put the lines we consumed back by adjusting i to before this block.
        i -= nextBlock.length;
        break;
      }
    }

    // If 3+ consecutive rules share the same property names, collapse.
    if (group.length >= 3) {
      result.push(...group[0]!.block);
      const propNames = props.join(", ");
      result.push(
        `  /* [${group.length - 2} similar rule blocks omitted: same ${props.length} propert${props.length === 1 ? "y" : "ies"} (${propNames})] */`,
      );
      result.push(...group[group.length - 1]!.block);
    } else {
      for (const g of group) {
        result.push(...g.block);
      }
    }
  }

  return result;
}

/** Main entry: compress a read_file result string. */
export function compressReadFile(result: string, opts: ReadFileCompressOptions = {}): FilterResult {
  const rawChars = result.length;
  if (rawChars === 0) {
    return { output: "", rawChars: 0, filteredChars: 0, truncated: false };
  }

  const config = { ...DEFAULT_OPTS, ...opts };
  let lines = result.split("\n");

  if (config.importCollapse) {
    lines = collapseImports(lines);
  }
  if (config.cssRuleCollapse) {
    lines = collapseCssBlocks(lines);
  }
  lines = collapseBlankLines(lines, config.blankLineMax);
  lines = compressCommentBlocks(lines, config.commentThreshold);
  lines = stripTrailingBlanks(lines);

  const output = lines.join("\n");
  const filteredChars = output.length;
  const truncated = filteredChars < rawChars;

  return { output, rawChars, filteredChars, truncated };
}
