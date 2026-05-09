/** Post-format shell output filtering ΓÇö compresses tool results before model context. */
import { type CommandCategory, classifyCommand } from "./classifier.js";
import {
  type FilterLineConfig,
  boostForVerbose,
  isFilterEnabled,
  readFilterLineConfig,
} from "./filter-config.js";
import { type FilterMeta, isVerboseCommand, parseResultMeta } from "./filter-meta.js";
import { buildFilter } from "./filters/build-output.js";
import { fsListingFilter } from "./filters/fs-listing.js";
import { type FilterResult, genericFilter } from "./filters/generic.js";
import { gitDiffFilter } from "./filters/git-diff.js";
import { gitLogFilter } from "./filters/git-log.js";
import { gitShowFilter } from "./filters/git-show.js";
import { gitStatusFilter } from "./filters/git-status.js";
import { jsonFilter } from "./filters/json-output.js";
import { lintFilter } from "./filters/lint-output.js";
import { logFilter } from "./filters/logs.js";
import { searchFilter } from "./filters/search.js";
import { testFilter } from "./filters/test-output.js";
import { typecheckFilter } from "./filters/typecheck-output.js";
import { getRawOutputStore } from "./raw-output-store.js";
import { stripAnsi } from "./strip-ansi.js";
import { recordFilterTelemetry } from "./telemetry.js";

export type { FilterMeta };
export { classifyCommand } from "./classifier.js";
export { isFilterEnabled, shellOutputFiltersEnabled } from "./filter-config.js";
export { genericFilter } from "./filters/generic.js";
export { getRawOutputStore, RawOutputStore, resetRawOutputStore } from "./raw-output-store.js";
export { stripAnsi } from "./strip-ansi.js";
export { getFilterTelemetryStore, resetFilterTelemetryStore } from "./telemetry.js";
export type { FilterTelemetryEntry, FilterTelemetrySummary } from "./telemetry.js";

/** Route a classified command to its category-specific filter, using resolved line config. */
function categoryFilter(
  category: CommandCategory | "logs",
  formatted: string,
  lc: FilterLineConfig,
): FilterResult {
  switch (category) {
    case "git-diff":
      return gitDiffFilter(formatted, {
        fileHeadLines: lc.gitDiffFileHead,
        tailLines: lc.gitDiffTail,
      });
    case "git-show":
      return gitShowFilter(formatted, {
        fileHeadLines: lc.gitDiffFileHead,
        tailLines: lc.gitDiffTail,
      });
    case "git-log":
      return gitLogFilter(formatted, { headCommits: lc.gitLogHead, tailCommits: lc.gitLogTail });
    case "git-status":
      return gitStatusFilter(formatted, {
        headLines: lc.gitStatusHead,
        tailLines: lc.gitStatusTail,
      });
    case "test":
      return testFilter(formatted, { headLines: lc.testHead, tailLines: lc.testTail });
    case "build":
      return buildFilter(formatted, { headLines: lc.buildHead, tailLines: lc.buildTail });
    case "lint":
      return lintFilter(formatted, { headLines: lc.lintHead, tailLines: lc.lintTail });
    case "typecheck":
      return typecheckFilter(formatted, {
        headLines: lc.typecheckHead,
        tailLines: lc.typecheckTail,
      });
    case "ls-tree":
      return fsListingFilter(formatted, {
        maxEntries: lc.fsMaxEntries,
        headLines: lc.fsHeadLines,
        tailLines: lc.fsTailLines,
      });
    case "search":
      return searchFilter(formatted, {
        maxMatchesPerFile: lc.searchMaxMatchesPerFile,
        maxFiles: lc.searchMaxFiles,
        headLines: lc.searchHeadLines,
        tailLines: lc.searchTailLines,
      });
    case "json":
      return jsonFilter(formatted, {
        maxKeysPerObject: lc.jsonMaxKeysPerObject,
        maxArrayItems: lc.jsonMaxArrayItems,
        maxDepth: lc.jsonMaxDepth,
        maxValueLength: lc.jsonMaxValueLength,
      });
    case "logs":
      return logFilter(formatted, {
        headLines: lc.logHead,
        tailLines: lc.logTail,
        maxConsecutiveDupes: lc.logMaxConsecutiveDupes,
      });
    default:
      return genericFilter(formatted, { headLines: lc.genericHead, tailLines: lc.genericTail });
  }
}

/** Filter a formatted shell tool result for model context. Returns possibly compressed string. */
export function filterShellOutput(formatted: string, meta: FilterMeta): string {
  if (!isFilterEnabled()) {
    return formatted;
  }

  // Strip ANSI escape codes ΓÇö the model doesn't need color/styling sequences,
  // and their presence would distort line-count heuristics in the filters.
  // The raw-output store retains the original (with ANSI) for recovery.
  const stripped = stripAnsi(formatted);

  // Background job tools (run_background, job_output, stop_job) use the
  // log-aware filter with deduplication and readiness/error preservation.
  const isJobTool =
    meta.tool === "run_background" || meta.tool === "job_output" || meta.tool === "stop_job";

  // Enrich meta with parsed exitCode/timedOut if caller didn't provide them.
  let enriched = meta;
  if (meta.exitCode === undefined && meta.timedOut === undefined) {
    const parsed = parseResultMeta(stripped, meta.tool);
    enriched = { ...meta, ...parsed };
  }

  // Error-aware: never filter output from failed commands ΓÇö the full output is
  // more valuable for debugging than any token savings from compression.
  // Still store the raw output so the user can recover it via raw_output.
  if (enriched.timedOut || (enriched.exitCode !== null && enriched.exitCode !== 0)) {
    const store = getRawOutputStore();
    const rawId = store.store(formatted, {
      command: enriched.command,
      tool: enriched.tool,
      filteredChars: stripped.length,
    });
    recordFilterTelemetry({
      command: enriched.command,
      filterKind: "error-bypass",
      rawChars: stripped.length,
      filteredChars: stripped.length,
      rawOutputId: rawId,
      fallbackUsed: false,
    });
    return stripped;
  }

  try {
    const rawLc = readFilterLineConfig();
    // Verbose commands get doubled head/tail limits ΓÇö the user explicitly
    // asked for more detail, so compress less aggressively.
    const lc = isVerboseCommand(enriched.command) ? boostForVerbose(rawLc) : rawLc;
    // Job tools route directly to the log filter ΓÇö command classification
    // is less useful for background job output than log-aware deduplication.
    const category: CommandCategory | "logs" = isJobTool
      ? "logs"
      : classifyCommand(enriched.command).category;
    const result = categoryFilter(category, stripped, lc);

    // Store raw output (with ANSI) and add recovery marker when output was compressed.
    if (result.truncated) {
      const store = getRawOutputStore();
      const rawId = store.store(formatted, {
        command: enriched.command,
        tool: enriched.tool,
        filteredChars: result.filteredChars,
      });
      recordFilterTelemetry({
        command: enriched.command,
        filterKind: category,
        rawChars: result.rawChars,
        filteredChars: result.filteredChars,
        rawOutputId: rawId,
        fallbackUsed: false,
      });
      const marker = `[filtered ${result.rawChars} chars -> ${result.filteredChars} chars ┬╖ raw_output_id=${rawId}]`;
      return `${result.output}\n${marker}`;
    }

    recordFilterTelemetry({
      command: enriched.command,
      filterKind: category,
      rawChars: result.rawChars,
      filteredChars: result.filteredChars,
      rawOutputId: null,
      fallbackUsed: false,
    });

    return result.output;
  } catch {
    // Fail open: any error returns the ANSI-stripped string.
    // Still store the raw output for recovery.
    const store = getRawOutputStore();
    const rawId = store.store(formatted, {
      command: enriched.command,
      tool: enriched.tool,
      filteredChars: stripped.length,
    });
    recordFilterTelemetry({
      command: enriched.command,
      filterKind: "fallback",
      rawChars: stripped.length,
      filteredChars: stripped.length,
      rawOutputId: rawId,
      fallbackUsed: true,
    });
    return stripped;
  }
}
