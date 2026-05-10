/** Dispatch-level tool result filter: compresses non-shell results before model context, skips <500 chars, edit_file passthrough, shell bypass. */

import { isFilterEnabled, readFilterLineConfig } from "../shell/output-filter/filter-config.js";
import { type FilterResult, genericFilter } from "../shell/output-filter/filters/generic.js";
import { jsonFilter } from "../shell/output-filter/filters/json-output.js";
import { logFilter } from "../shell/output-filter/filters/logs.js";
import { searchFilter } from "../shell/output-filter/filters/search.js";
import { getRawOutputStore } from "../shell/output-filter/raw-output-store.js";
import { recordFilterTelemetry } from "../shell/output-filter/telemetry.js";
import { type ToolFilterCategory, classifyTool, isShellTool } from "./classify-tool.js";
import { compressReadFile } from "./compress-read-file.js";

/** Minimum result length (chars) to justify filtering overhead. */
const MIN_FILTER_CHARS = 500;

/** Route a classified tool category to its compressor, using resolved line config. */
function toolCategoryFilter(
  category: ToolFilterCategory,
  result: string,
  lc: ReturnType<typeof readFilterLineConfig>,
): FilterResult {
  switch (category) {
    case "read_file":
      return compressReadFile(result, {
        importCollapse: lc.readImportCollapse === 1,
        blankLineMax: lc.readBlankLineMax,
        commentThreshold: lc.readCommentThreshold,
      });
    case "search_content":
      return searchFilter(result, {
        maxMatchesPerFile: lc.searchMaxMatchesPerFile,
        maxFiles: lc.searchMaxFiles,
        headLines: lc.searchHeadLines,
        tailLines: lc.searchTailLines,
      });
    case "job_log":
      return logFilter(result, {
        headLines: lc.logHead,
        tailLines: lc.logTail,
        maxConsecutiveDupes: lc.logMaxConsecutiveDupes,
      });
    case "mcp": {
      // MCP tool results: apply jsonFilter if JSON-like, else genericFilter
      const trimmed = result.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return jsonFilter(result, {
          maxKeysPerObject: lc.jsonMaxKeysPerObject,
          maxArrayItems: lc.jsonMaxArrayItems,
          maxDepth: lc.jsonMaxDepth,
          maxValueLength: lc.jsonMaxValueLength,
        });
      }
      return genericFilter(result, { headLines: lc.genericHead, tailLines: lc.genericTail });
    }
    case "edit_file":
      // De-prioritized per adversarial review: edit diffs have minimal
      // token savings vs. read_file, and context lines are verification
      // landmarks. Passthrough for now.
      return {
        output: result,
        rawChars: result.length,
        filteredChars: result.length,
        truncated: false,
      };
    case "memory":
    case "web":
    case "plan":
      return genericFilter(result, { headLines: lc.genericHead, tailLines: lc.genericTail });
    case "shell":
      // Shell tools are already filtered by filterShellOutput() —
      // return as-is to avoid double-compression.
      return {
        output: result,
        rawChars: result.length,
        filteredChars: result.length,
        truncated: false,
      };
    default:
      return {
        output: result,
        rawChars: result.length,
        filteredChars: result.length,
        truncated: false,
      };
  }
}

/** Filter a tool result for model context. Called from ToolRegistry.dispatch(). */
export function filterToolResult(toolName: string, result: string): string {
  if (!isFilterEnabled()) return result;

  // Shell tools already filtered by filterShellOutput — skip.
  if (isShellTool(toolName)) return result;

  // raw_output is the recovery inspector — never filter.
  if (toolName === "raw_output") return result;

  // Skip small results — overhead outweighs savings.
  if (result.length < MIN_FILTER_CHARS) return result;

  try {
    const category = classifyTool(toolName);
    const lc = readFilterLineConfig();
    const filtered = toolCategoryFilter(category, result, lc);

    if (filtered.truncated) {
      const store = getRawOutputStore();
      const rawId = store.store(result, {
        command: toolName,
        tool: toolName,
        filteredChars: filtered.filteredChars,
      });
      recordFilterTelemetry({
        command: toolName,
        tool: toolName,
        filterKind: category,
        rawChars: filtered.rawChars,
        filteredChars: filtered.filteredChars,
        rawOutputId: rawId,
        fallbackUsed: false,
      });
      const marker = `[filtered ${filtered.rawChars} chars -> ${filtered.filteredChars} chars · raw_output_id=${rawId}]`;
      return `${filtered.output}\n${marker}`;
    }

    // Record telemetry even for non-truncated results (shows filter activity).
    if (filtered.rawChars !== filtered.filteredChars) {
      recordFilterTelemetry({
        command: toolName,
        tool: toolName,
        filterKind: category,
        rawChars: filtered.rawChars,
        filteredChars: filtered.filteredChars,
        rawOutputId: null,
        fallbackUsed: false,
      });
    }

    return filtered.output;
  } catch {
    // Fail open: any error returns the original result unchanged.
    // Still store the raw output for recovery.
    const store = getRawOutputStore();
    const rawId = store.store(result, {
      command: toolName,
      tool: toolName,
      filteredChars: result.length,
    });
    recordFilterTelemetry({
      command: toolName,
      tool: toolName,
      filterKind: "fallback",
      rawChars: result.length,
      filteredChars: result.length,
      rawOutputId: rawId,
      fallbackUsed: true,
    });
    return result;
  }
}
