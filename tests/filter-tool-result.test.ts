import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterToolResult } from "../src/tools/output-filter/filter-tool-result.js";
import { resetRawOutputStore } from "../src/tools/shell/output-filter/raw-output-store.js";
import {
  getFilterTelemetryStore,
  resetFilterTelemetryStore,
} from "../src/tools/shell/output-filter/telemetry.js";

beforeEach(() => {
  resetFilterTelemetryStore();
  resetRawOutputStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("filterToolResult — bypass", () => {
  it("passes through when filter is disabled", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "off");
    const big = "x".repeat(2000);
    const result = filterToolResult("read_file", big);
    expect(result).toBe(big);
  });

  it("passes through shell tools (already filtered)", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const big = "x".repeat(2000);
    const result = filterToolResult("run_command", big);
    expect(result).toBe(big);
  });

  it("passes through raw_output (recovery inspector)", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const big = "x".repeat(2000);
    const result = filterToolResult("raw_output", big);
    expect(result).toBe(big);
  });

  it("passes through small results (< 500 chars)", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const small = "const x = 1;";
    const result = filterToolResult("read_file", small);
    expect(result).toBe(small);
  });
});

describe("filterToolResult — read_file", () => {
  it("compresses a large read_file result with imports", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const lines = [
      "import { useState, useEffect } from 'react';",
      "import { Button } from './components';",
      "import type { Config } from './types';",
      "",
    ];
    // Pad to >500 chars
    for (let i = 0; i < 30; i++) lines.push(`const line${i} = ${i};`);
    const input = lines.join("\n");

    const result = filterToolResult("read_file", input);
    expect(result).toContain("[3 imports:");
    expect(result).not.toContain("import { useState");
    expect(result).toContain("react(useState, useEffect)");
  });
});

describe("filterToolResult — MCP tools", () => {
  it("routes JSON MCP results through jsonFilter", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const json = JSON.stringify({
      results: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        description: "x".repeat(200),
      })),
    });
    const result = filterToolResult("mcp__memory__recall_memories", json);
    // jsonFilter should compress long arrays
    expect(result.length).toBeLessThan(json.length);
  });

  it("routes text MCP results through genericFilter", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const text = Array.from({ length: 200 }, (_, i) => `Line ${i}: some text content here`).join(
      "\n",
    );
    const result = filterToolResult("mcp__delegate__browse", text);
    expect(result.length).toBeLessThan(text.length);
  });
});

describe("filterToolResult — job_log", () => {
  it("routes wait_for_job through logFilter", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const log = Array.from({ length: 200 }, (_, i) => `[INFO] Build step ${i} complete`).join("\n");
    const result = filterToolResult("wait_for_job", log);
    expect(result.length).toBeLessThan(log.length);
  });

  it("routes list_jobs through logFilter", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const log = Array.from({ length: 200 }, (_, i) => `Job ${i}: running`).join("\n");
    const result = filterToolResult("list_jobs", log);
    expect(result.length).toBeLessThan(log.length);
  });
});

describe("filterToolResult — fail open", () => {
  it("returns original on filter error", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    // A string that could cause issues with split/join
    const input = "x".repeat(1000);
    // Should not throw even if something goes wrong internally
    const result = filterToolResult("read_file", input);
    expect(typeof result).toBe("string");
  });
});

describe("filterToolResult — telemetry", () => {
  it("records telemetry when compression occurs", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) lines.push(`import { sym${i} } from 'mod${i}';`);
    lines.push("");
    for (let i = 0; i < 30; i++) lines.push(`const x${i} = ${i};`);
    const input = lines.join("\n");

    filterToolResult("read_file", input);

    const summary = getFilterTelemetryStore().getSummary();
    expect(summary.totalCalls).toBeGreaterThanOrEqual(1);
    expect(summary.filteredCalls).toBeGreaterThanOrEqual(1);
  });

  it("records tool name in telemetry entry", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) lines.push(`import { sym${i} } from 'mod${i}';`);
    lines.push("");
    for (let i = 0; i < 30; i++) lines.push(`const x${i} = ${i};`);
    const input = lines.join("\n");

    filterToolResult("read_file", input);

    const entries = getFilterTelemetryStore().getEntries();
    const readEntry = entries.find((e) => e.tool === "read_file");
    expect(readEntry).toBeDefined();
    expect(readEntry!.filterKind).toBe("read_file");
  });
});

describe("filterToolResult — edit_file passthrough", () => {
  it("passes through edit_file results unchanged", () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const diff =
      "@@ -1,5 +1,5 @@\n-const old = 1;\n+const new = 2;\n context line\n more context\n even more context";
    const paddedDiff = `${diff}\n${"x".repeat(500)}`;
    const result = filterToolResult("edit_file", paddedDiff);
    expect(result).toBe(paddedDiff);
  });
});
