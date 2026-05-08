import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ClassifiedCommand,
  classifyCommand,
} from "../src/tools/shell/output-filter/classifier.js";
import {
  normalizationEnabled,
  normalizeCommand,
} from "../src/tools/shell/output-filter/command-normalizer.js";
import {
  boostForVerbose,
  readFilterLineConfig,
} from "../src/tools/shell/output-filter/filter-config.js";
import { isVerboseCommand, parseResultMeta } from "../src/tools/shell/output-filter/filter-meta.js";
import { buildFilter } from "../src/tools/shell/output-filter/filters/build-output.js";
import { fsListingFilter } from "../src/tools/shell/output-filter/filters/fs-listing.js";
import {
  type GenericFilterOptions,
  genericFilter,
} from "../src/tools/shell/output-filter/filters/generic.js";
import { gitDiffFilter } from "../src/tools/shell/output-filter/filters/git-diff.js";
import { gitLogFilter } from "../src/tools/shell/output-filter/filters/git-log.js";
import { gitShowFilter } from "../src/tools/shell/output-filter/filters/git-show.js";
import { gitStatusFilter } from "../src/tools/shell/output-filter/filters/git-status.js";
import { jsonFilter } from "../src/tools/shell/output-filter/filters/json-output.js";
import { lintFilter } from "../src/tools/shell/output-filter/filters/lint-output.js";
import { logFilter } from "../src/tools/shell/output-filter/filters/logs.js";
import { searchFilter } from "../src/tools/shell/output-filter/filters/search.js";
import { testFilter } from "../src/tools/shell/output-filter/filters/test-output.js";
import { typecheckFilter } from "../src/tools/shell/output-filter/filters/typecheck-output.js";
import {
  type FilterMeta,
  filterShellOutput,
  getRawOutputStore,
  resetRawOutputStore,
} from "../src/tools/shell/output-filter/index.js";
import {
  getFilterTelemetryStore,
  resetFilterTelemetryStore,
} from "../src/tools/shell/output-filter/telemetry.js";

// ΓöÇΓöÇ Command classifier ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("classifyCommand", () => {
  it("classifies git status", () => {
    const c = classifyCommand("git status -s");
    expect(c.category).toBe("git-status");
    expect(c.base).toBe("git");
  });

  it("classifies git diff", () => {
    expect(classifyCommand("git diff").category).toBe("git-diff");
    expect(classifyCommand("git diff --stat HEAD~3").category).toBe("git-diff");
  });

  it("classifies git log", () => {
    expect(classifyCommand("git log --oneline -10").category).toBe("git-log");
  });

  it("classifies git show", () => {
    expect(classifyCommand("git show HEAD").category).toBe("git-show");
  });

  it("classifies git other", () => {
    expect(classifyCommand("git add .").category).toBe("git-other");
    expect(classifyCommand("git commit -m 'fix'").category).toBe("git-other");
  });

  it("classifies ls-tree commands", () => {
    expect(classifyCommand("ls -la src/").category).toBe("ls-tree");
    expect(classifyCommand("dir /s /b *.ts").category).toBe("ls-tree");
    expect(classifyCommand("tree src/ -L 2").category).toBe("ls-tree");
    expect(classifyCommand("find . -name '*.ts'").category).toBe("ls-tree");
  });

  it("classifies search commands", () => {
    expect(classifyCommand("grep -r 'TODO' src/").category).toBe("search");
    expect(classifyCommand("rg 'pattern' src/").category).toBe("search");
    expect(classifyCommand("findstr /s 'error' *.log").category).toBe("search");
  });

  it("classifies test commands", () => {
    expect(classifyCommand("vitest run").category).toBe("test");
    expect(classifyCommand("jest --coverage").category).toBe("test");
    expect(classifyCommand("pytest tests/").category).toBe("test");
    expect(classifyCommand("cargo test").category).toBe("test");
    expect(classifyCommand("go test ./...").category).toBe("test");
    expect(classifyCommand("npm test").category).toBe("test");
    expect(classifyCommand("pnpm test").category).toBe("test");
  });

  it("classifies build commands", () => {
    expect(classifyCommand("cargo build").category).toBe("build");
    expect(classifyCommand("go build ./...").category).toBe("build");
    expect(classifyCommand("npm run build").category).toBe("build");
    expect(classifyCommand("make").category).toBe("build");
  });

  it("classifies lint commands", () => {
    expect(classifyCommand("eslint src/").category).toBe("lint");
    expect(classifyCommand("ruff check .").category).toBe("lint");
    expect(classifyCommand("cargo clippy").category).toBe("lint");
  });

  it("classifies typecheck commands", () => {
    expect(classifyCommand("tsc --noEmit").category).toBe("typecheck");
    expect(classifyCommand("pyright src/").category).toBe("typecheck");
  });

  it("falls back to generic for unknown commands", () => {
    expect(classifyCommand("echo hello").category).toBe("generic");
    expect(classifyCommand("python script.py").category).toBe("generic");
  });

  it("strips runner prefix for npx/pnpm/npm/yarn", () => {
    expect(classifyCommand("npx vitest run").category).toBe("test");
    expect(classifyCommand("pnpm vitest").category).toBe("test");
    expect(classifyCommand("npm run build").category).toBe("build");
  });

  it("does not misclassify 'cargo' as build when test is intended", () => {
    expect(classifyCommand("cargo test").category).toBe("test");
    expect(classifyCommand("cargo build").category).toBe("build");
    expect(classifyCommand("cargo clippy").category).toBe("lint");
  });

  it("does not misclassify 'go' as build when test is intended", () => {
    expect(classifyCommand("go test ./...").category).toBe("test");
    expect(classifyCommand("go build ./...").category).toBe("build");
  });
});

// ΓöÇΓöÇ Generic filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("genericFilter", () => {
  it("passes through short output unchanged", () => {
    const input = "$ git status\n[exit 0]\nM foo.ts\n?? bar.ts";
    const result = genericFilter(input);
    expect(result.output).toBe(input);
    expect(result.truncated).toBe(false);
  });

  it("passes through empty output", () => {
    const result = genericFilter("");
    expect(result.output).toBe("");
    expect(result.rawChars).toBe(0);
  });

  it("passes through output below the threshold", () => {
    const lines = ["$ cmd", "[exit 0]", ...Array(10).fill("output line")];
    const input = lines.join("\n");
    const result = genericFilter(input, { headLines: 20, tailLines: 30 });
    expect(result.output).toBe(input);
    expect(result.truncated).toBe(false);
  });

  it("truncates long output with head+tail window", () => {
    const header = ["$ cmd", "[exit 0]"];
    const body = Array(100).fill("body line");
    const input = [...header, ...body].join("\n");
    const opts: GenericFilterOptions = { headLines: 5, tailLines: 5 };
    const result = genericFilter(input, opts);
    expect(result.truncated).toBe(true);
    expect(result.rawChars).toBe(input.length);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
    // Should contain head lines, omission marker, and tail lines
    expect(result.output).toContain("ΓÇª 90 lines omitted ΓÇª");
    // Header preserved
    expect(result.output).toContain("$ cmd");
    expect(result.output).toContain("[exit 0]");
  });

  it("preserves the header block intact", () => {
    const header = ["$ git diff --stat", "[exit 0]"];
    const body = Array(80).fill("src/foo.ts | 4 ++--");
    const input = [...header, ...body].join("\n");
    const result = genericFilter(input, { headLines: 10, tailLines: 10 });
    expect(result.output.startsWith("$ git diff --stat\n[exit 0]")).toBe(true);
  });

  it("handles job-format headers", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 1234 ┬╖ byteLength=5000]", "$ npm run dev"];
    const body = Array(80).fill("log line");
    const input = [...header, ...body].join("\n");
    const result = genericFilter(input, { headLines: 5, tailLines: 5 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("[job 1");
  });

  it("collapses consecutive blank lines in body", () => {
    const header = ["$ cmd", "[exit 0]"];
    const body = ["line1", "", "", "", "line2", "", "", "", "line3"];
    const input = [...header, ...body].join("\n");
    const result = genericFilter(input, { headLines: 20, tailLines: 20 });
    // Consecutive blanks collapsed to single blank
    expect(result.output).not.toMatch(/\n\n\n/);
  });

  it("never expands output", () => {
    const input = "$ cmd\n[exit 0]\nshort";
    const result = genericFilter(input);
    expect(result.filteredChars).toBeLessThanOrEqual(result.rawChars);
  });
});

// ΓöÇΓöÇ Integration: filterShellOutput ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("filterShellOutput", () => {
  const originalEnv = process.env.REASONIX_OUTPUT_FILTERS;

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env.REASONIX_OUTPUT_FILTERS = undefined;
    } else {
      process.env.REASONIX_OUTPUT_FILTERS = originalEnv;
    }
    resetRawOutputStore();
  });

  it("passes through short output unchanged", () => {
    const formatted = "$ git status -s\n[exit 0]\nM src/foo.ts";
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git status -s",
      exitCode: 0,
      timedOut: false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("filters long run_command output", () => {
    const header = ["$ cargo build", "[exit 0]"];
    const body = Array(100).fill("Compiling dependency v0.1.0");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "cargo build",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
    expect(result).toContain("$ cargo build");
    expect(result).toContain("[exit 0]");
    expect(result).toContain("ΓÇª");
  });

  it("preserves empty string output", () => {
    const meta: FilterMeta = {
      tool: "run_command",
      command: "echo",
      exitCode: null,
      timedOut: false,
    };
    expect(filterShellOutput("", meta)).toBe("");
  });

  it("respects REASONIX_OUTPUT_FILTERS=off escape hatch", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "off";
    const header = ["$ cmd", "[exit 0]"];
    const body = Array(100).fill("line");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = { tool: "run_command", command: "cmd", exitCode: 0, timedOut: false };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("fails open on unexpected errors", () => {
    const formatted = "$ echo hi\n[exit 0]\nhi";
    const meta: FilterMeta = {
      tool: "run_command",
      command: "echo hi",
      exitCode: 0,
      timedOut: false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("adds recovery marker when output is truncated", () => {
    resetRawOutputStore();
    const header = ["$ cmd", "[exit 0]"];
    const body = Array(100).fill("body line");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = { tool: "run_command", command: "cmd", exitCode: 0, timedOut: false };
    const result = filterShellOutput(formatted, meta);
    expect(result).toContain("filtered");
    expect(result).toContain("chars ->");
    expect(result).toContain("raw_output_id=");
    // Extract the raw_output_id and verify the store has it.
    const idMatch = result.match(/raw_output_id=(\d+)/);
    expect(idMatch).not.toBeNull();
    const rawId = Number(idMatch![1]);
    const store = getRawOutputStore();
    const entry = store.get(rawId);
    expect(entry).toBeDefined();
    expect(entry!.raw).toBe(formatted);
    expect(entry!.command).toBe("cmd");
  });

  it("does not add recovery marker when output fits", () => {
    resetRawOutputStore();
    const formatted = "$ git status -s\n[exit 0]\nM src/foo.ts";
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git status -s",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).not.toContain("raw_output_id=");
  });

  it("error-bypass stores raw output for recovery", () => {
    resetRawOutputStore();
    const input = "$ bad-cmd\n[exit 1]\nerror output";
    filterShellOutput(input, {
      tool: "run_command",
      command: "bad-cmd",
      exitCode: 1,
      timedOut: false,
    });
    const store = getRawOutputStore();
    expect(store.size).toBe(1);
    const entry = store.get(1);
    expect(entry).toBeDefined();
    expect(entry!.command).toBe("bad-cmd");
    expect(entry!.tool).toBe("run_command");
  });

  it("timeout-bypass stores raw output for recovery", () => {
    resetRawOutputStore();
    const input = "$ slow-cmd\n[killed after timeout]\npartial output";
    filterShellOutput(input, {
      tool: "run_command",
      command: "slow-cmd",
      exitCode: null,
      timedOut: true,
    });
    const store = getRawOutputStore();
    expect(store.size).toBe(1);
    const entry = store.get(1);
    expect(entry).toBeDefined();
    expect(entry!.command).toBe("slow-cmd");
  });

  it("error-bypass records rawOutputId in telemetry", () => {
    resetRawOutputStore();
    resetFilterTelemetryStore();
    const input = "$ bad-cmd\n[exit 1]\nerror output";
    filterShellOutput(input, {
      tool: "run_command",
      command: "bad-cmd",
      exitCode: 1,
      timedOut: false,
    });
    const telStore = getFilterTelemetryStore();
    const entries = telStore.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.rawOutputId).not.toBeNull();
    expect(entries[0]!.rawOutputId).toBe(1);
  });
});

// ΓöÇΓöÇ parseResultMeta ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("parseResultMeta", () => {
  it("parses exit code from run_command header", () => {
    const formatted = "$ cargo build\n[exit 42]\nsome output";
    const result = parseResultMeta(formatted, "run_command");
    expect(result.exitCode).toBe(42);
    expect(result.timedOut).toBe(false);
  });

  it("detects timeout in run_command header", () => {
    const formatted = "$ sleep 999\n[killed after timeout]";
    const result = parseResultMeta(formatted, "run_command");
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(true);
  });

  it("parses exit code from stop_job header", () => {
    const formatted = "[job 1 stopped ┬╖ exit 0]\n$ echo hi";
    const result = parseResultMeta(formatted, "stop_job");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("parses exit code from job_output header", () => {
    const formatted = "[job 1 ┬╖ exited 1 ┬╖ byteLength=500]\n$ npm test";
    const result = parseResultMeta(formatted, "job_output");
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it("returns nulls for run_background with no exit code", () => {
    const formatted = "[job 1 started ┬╖ pid 123 ┬╖ running (no ready signal yet)]";
    const result = parseResultMeta(formatted, "run_background");
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
  });
});

// ΓöÇΓöÇ RawOutputStore ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

import { RawOutputStore } from "../src/tools/shell/output-filter/raw-output-store.js";

describe("RawOutputStore", () => {
  it("stores and retrieves entries by ID", () => {
    const store = new RawOutputStore();
    const id = store.store("raw output", {
      command: "cmd",
      tool: "run_command",
      filteredChars: 10,
    });
    const entry = store.get(id);
    expect(entry).toBeDefined();
    expect(entry!.raw).toBe("raw output");
    expect(entry!.command).toBe("cmd");
    expect(entry!.tool).toBe("run_command");
    expect(entry!.filteredChars).toBe(10);
  });

  it("auto-increments IDs", () => {
    const store = new RawOutputStore();
    const id1 = store.store("first", { command: "a", tool: "run_command", filteredChars: 5 });
    const id2 = store.store("second", { command: "b", tool: "run_command", filteredChars: 6 });
    expect(id2).toBe(id1 + 1);
  });

  it("returns undefined for missing IDs", () => {
    const store = new RawOutputStore();
    expect(store.get(999)).toBeUndefined();
  });

  it("evicts oldest entries when at capacity", () => {
    const store = new RawOutputStore({ maxEntries: 3 });
    const id1 = store.store("first", { command: "a", tool: "run_command", filteredChars: 5 });
    store.store("second", { command: "b", tool: "run_command", filteredChars: 6 });
    store.store("third", { command: "c", tool: "run_command", filteredChars: 7 });
    // At capacity ΓÇö next store evicts oldest.
    store.store("fourth", { command: "d", tool: "run_command", filteredChars: 8 });
    expect(store.get(id1)).toBeUndefined();
    expect(store.size).toBe(3);
  });

  it("caps raw output at maxRawChars", () => {
    const store = new RawOutputStore({ maxRawChars: 10 });
    const longOutput = "a".repeat(100);
    const id = store.store(longOutput, { command: "cmd", tool: "run_command", filteredChars: 10 });
    const entry = store.get(id);
    expect(entry!.raw.length).toBe(10);
  });

  it("getFiltered applies tailLines", () => {
    const store = new RawOutputStore();
    const lines = Array(20).fill("line");
    const raw = lines.join("\n");
    const id = store.store(raw, { command: "cmd", tool: "run_command", filteredChars: 10 });
    const entry = store.getFiltered(id, { tailLines: 5 });
    expect(entry!.raw).toContain("15 earlier lines");
    expect(entry!.raw).toContain("line");
  });

  it("getFiltered applies maxChars", () => {
    const store = new RawOutputStore();
    const id = store.store("a".repeat(100), {
      command: "cmd",
      tool: "run_command",
      filteredChars: 10,
    });
    const entry = store.getFiltered(id, { maxChars: 10 });
    expect(entry!.raw.length).toBe(10);
  });

  it("clear resets the store", () => {
    const store = new RawOutputStore();
    store.store("data", { command: "cmd", tool: "run_command", filteredChars: 4 });
    store.clear();
    expect(store.size).toBe(0);
    // After clear, IDs restart from 1.
    const newId = store.store("fresh", { command: "x", tool: "run_command", filteredChars: 5 });
    expect(newId).toBe(1);
  });
});

// ΓöÇΓöÇ git-diff filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("gitDiffFilter", () => {
  it("passes through short diff unchanged", () => {
    const formatted = [
      "$ git diff",
      "[exit 0]",
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,4 @@",
      " line1",
      "+added",
      " line2",
      " line3",
    ].join("\n");
    const result = gitDiffFilter(formatted);
    expect(result.truncated).toBe(false);
    expect(result.output).toContain("diff --git a/foo.ts");
  });

  it("preserves stat block in full diff output", () => {
    const statLine = "src/foo.ts | 12 +++++-------";
    const summaryLine = "1 file changed, 5 insertions(+), 7 deletions(-)";
    const diffHeader = "diff --git a/src/foo.ts b/src/foo.ts";
    const diffLines = Array(50).fill("+added line");
    const formatted = [
      "$ git diff",
      "[exit 0]",
      statLine,
      summaryLine,
      diffHeader,
      "index abc..def",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,50 +1,50 @@",
      ...diffLines,
    ].join("\n");
    const result = gitDiffFilter(formatted);
    expect(result.truncated).toBe(true);
    expect(result.output).toContain(statLine);
    expect(result.output).toContain(summaryLine);
    expect(result.output).toContain("diff --git");
  });

  it("delegates stat-only output to generic filter", () => {
    const formatted = [
      "$ git diff --stat",
      "[exit 0]",
      " src/foo.ts | 12 +++++-------",
      " 1 file changed, 5 insertions(+), 7 deletions(-)",
    ].join("\n");
    const result = gitDiffFilter(formatted);
    expect(result.truncated).toBe(false);
  });

  it("handles diff with no stat block", () => {
    const diffHeader = "diff --git a/bar.ts b/bar.ts";
    const diffLines = Array(50).fill(" context");
    const formatted = [
      "$ git diff",
      "[exit 0]",
      diffHeader,
      "index abc..def",
      "--- a/bar.ts",
      "+++ b/bar.ts",
      "@@ -1,50 +1,50 @@",
      ...diffLines,
    ].join("\n");
    const result = gitDiffFilter(formatted);
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("diff --git");
  });
});

// ΓöÇΓöÇ git-log filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("gitLogFilter", () => {
  it("passes through short log unchanged", () => {
    const formatted = [
      "$ git log --oneline -5",
      "[exit 0]",
      "abc1234 fix: typo",
      "def5678 feat: add filter",
      "ghi9012 chore: deps",
    ].join("\n");
    const result = gitLogFilter(formatted);
    expect(result.truncated).toBe(false);
    expect(result.output).toBe(formatted);
  });

  it("compresses long oneline log with head/tail", () => {
    const commits = Array(100)
      .fill(0)
      .map((_, i) => `${i.toString(16).padStart(7, "0")} commit ${i}`);
    const formatted = ["$ git log --oneline", "[exit 0]", ...commits].join("\n");
    const result = gitLogFilter(formatted, { headCommits: 25, tailCommits: 15 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("commits omitted");
    expect(result.output).toContain("0000000 commit 0");
    expect(result.output).toContain("0000063 commit 99");
  });

  it("falls back to generic for full-format log", () => {
    const formatted = [
      "$ git log",
      "[exit 0]",
      "commit abc1234",
      "Author: Test <test@test.com>",
      "Date:   Mon Jan 1 00:00:00 2024",
      "",
      "    fix: something",
      "",
      "    Long body here.",
    ].join("\n");
    const result = gitLogFilter(formatted);
    // Non-oneline format ΓåÆ generic filter applied.
    expect(result.output).toContain("commit abc1234");
  });
});

// ΓöÇΓöÇ git-status filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("gitStatusFilter", () => {
  it("passes through short-format status", () => {
    const formatted = [
      "$ git status -s",
      "[exit 0]",
      "M src/foo.ts",
      "?? new-file.ts",
      "A staged.ts",
    ].join("\n");
    const result = gitStatusFilter(formatted);
    expect(result.truncated).toBe(false);
    expect(result.output).toContain("M src/foo.ts");
    expect(result.output).toContain("?? new-file.ts");
  });

  it("falls back to generic for long-format status", () => {
    const formatted = [
      "$ git status",
      "[exit 0]",
      "On branch main",
      "Changes to be committed:",
      '  (use "git restore --staged <file>..." to unstage)',
      "    modified:   src/foo.ts",
      "",
      "Untracked files:",
      '  (use "git add <file>..." to include in what will be committed)',
      "    new-file.ts",
    ].join("\n");
    const result = gitStatusFilter(formatted);
    expect(result.output).toContain("On branch main");
  });
});

// ΓöÇΓöÇ git-show filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("gitShowFilter", () => {
  it("preserves commit header in full", () => {
    const formatted = [
      "$ git show HEAD",
      "[exit 0]",
      "commit abc1234",
      "Author: Test <test@example.com>",
      "Date:   Mon Jan 1 00:00:00 2025 +0000",
      "",
      "    fix: important bug",
      "",
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 0000000..1111111 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,4 @@",
      " line1",
      " line2",
      "+added line",
      " line3",
    ].join("\n");
    const result = gitShowFilter(formatted);
    expect(result.output).toContain("commit abc1234");
    expect(result.output).toContain("Author: Test <test@example.com>");
    expect(result.output).toContain("fix: important bug");
    expect(result.output).toContain("diff --git a/src/foo.ts");
  });

  it("compresses large diff body while keeping commit header", () => {
    const diffLines = Array(80).fill("  context line of code");
    const formatted = [
      "$ git show HEAD",
      "[exit 0]",
      "commit def5678",
      "Author: Dev <dev@example.com>",
      "Date:   Tue Feb 2 00:00:00 2025 +0000",
      "",
      "    feat: big change",
      "",
      "diff --git a/src/big.ts b/src/big.ts",
      "index 0000000..1111111 100644",
      "--- a/src/big.ts",
      "+++ b/src/big.ts",
      "@@ -1,80 +1,80 @@",
      ...diffLines,
    ].join("\n");
    const result = gitShowFilter(formatted, { fileHeadLines: 10, tailLines: 5 });
    expect(result.output).toContain("commit def5678");
    expect(result.output).toContain("feat: big change");
    expect(result.output).toContain("diff --git");
    expect(result.truncated).toBe(true);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });

  it("falls back to generic for stat-only show", () => {
    const formatted = [
      "$ git show --stat HEAD",
      "[exit 0]",
      "commit ghi9012",
      "Author: Dev <dev@example.com>",
      "",
      " src/foo.ts | 5 ++---",
      " 1 file changed, 2 insertions(+), 3 deletions(-)",
    ].join("\n");
    const result = gitShowFilter(formatted);
    expect(result.output).toContain("commit ghi9012");
  });

  it("handles empty input", () => {
    const result = gitShowFilter("");
    expect(result.output).toBe("");
    expect(result.rawChars).toBe(0);
  });

  it("classifier routes git show to git-show category", () => {
    expect(classifyCommand("git show HEAD").category).toBe("git-show");
    expect(classifyCommand("git show --stat abc123").category).toBe("git-show");
  });
});

// ΓöÇΓöÇ json filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("jsonFilter", () => {
  it("compresses large JSON objects by limiting keys", () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < 20; i++) obj[`key_${i}`] = `value_${i}`;
    const formatted = `$ jq '.'\n[exit 0]\n${JSON.stringify(obj, null, 2)}`;
    const result = jsonFilter(formatted, {
      maxKeysPerObject: 5,
      maxArrayItems: 3,
      maxDepth: 3,
      maxValueLength: 80,
    });
    expect(result.output).toContain("key_0");
    expect(result.output).toMatch(/\+15 more keys/);
    expect(result.truncated).toBe(true);
  });

  it("compresses large JSON arrays by limiting items", () => {
    const arr = Array.from({ length: 30 }, (_, i) => `item_${i}`);
    const formatted = `$ jq '.items'\n[exit 0]\n${JSON.stringify(arr, null, 2)}`;
    const result = jsonFilter(formatted, {
      maxKeysPerObject: 10,
      maxArrayItems: 5,
      maxDepth: 3,
      maxValueLength: 80,
    });
    expect(result.output).toContain("item_0");
    expect(result.output).toMatch(/25 more items/);
  });

  it("truncates long string values", () => {
    const longValue = "x".repeat(200);
    const formatted = `$ jq '.'\n[exit 0]\n${JSON.stringify({ key: longValue })}`;
    const result = jsonFilter(formatted, {
      maxKeysPerObject: 10,
      maxArrayItems: 5,
      maxDepth: 3,
      maxValueLength: 50,
    });
    expect(result.output).toMatch(/200 chars/);
  });

  it("handles nested objects up to maxDepth", () => {
    const nested = { level1: { level2: { level3: { level4: "deep" } } } };
    const formatted = `$ jq '.'\n[exit 0]\n${JSON.stringify(nested, null, 2)}`;
    const result = jsonFilter(formatted, {
      maxKeysPerObject: 10,
      maxArrayItems: 5,
      maxDepth: 2,
      maxValueLength: 80,
    });
    expect(result.output).toContain("level1");
    expect(result.output).toContain("level2");
    // At depth 2, level3 should be compressed
    expect(result.output).toMatch(/1 keys/);
  });

  it("falls back to generic for non-JSON output", () => {
    const formatted = "$ jq '.'\n[exit 0]\nthis is not json";
    const result = jsonFilter(formatted);
    // Should not throw, should return some filtered output
    expect(result.output).toContain("this is not json");
  });

  it("passes through small JSON unchanged", () => {
    const small = { name: "test", count: 5 };
    const formatted = `$ jq '.'\n[exit 0]\n${JSON.stringify(small, null, 2)}`;
    const result = jsonFilter(formatted);
    expect(result.output).toContain("name");
    expect(result.output).toContain("test");
  });

  it("handles empty input", () => {
    const result = jsonFilter("");
    expect(result.output).toBe("");
    expect(result.rawChars).toBe(0);
  });

  it("classifier routes jq to json category", () => {
    expect(classifyCommand("jq '.' file.json").category).toBe("json");
    expect(classifyCommand("aws s3 ls --output json").category).toBe("json");
    expect(classifyCommand("npm ls --json").category).toBe("json");
  });
});

// ΓöÇΓöÇ error-aware filtering ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("error-aware filtering", () => {
  const originalEnv = process.env.REASONIX_OUTPUT_FILTERS;

  afterEach(() => {
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, "REASONIX_OUTPUT_FILTERS");
    } else {
      process.env.REASONIX_OUTPUT_FILTERS = originalEnv;
    }
    resetRawOutputStore();
  });

  beforeEach(() => {
    process.env.REASONIX_OUTPUT_FILTERS = "1";
  });

  it("skips filtering when exitCode is non-zero", () => {
    const header = ["$ cargo build", "[exit 1]"];
    const body = Array(100).fill("error: could not compile");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "cargo build",
      exitCode: 1,
      timedOut: false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("skips filtering when timedOut is true", () => {
    const formatted = "$ sleep 999\n[killed after timeout]\npartial output";
    const meta: FilterMeta = {
      tool: "run_command",
      command: "sleep 999",
      exitCode: null,
      timedOut: true,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("skips filtering when parsed exit code from header is non-zero", () => {
    const header = ["$ npm test", "[exit 1]"];
    const body = Array(100).fill("FAIL test suite");
    const formatted = [...header, ...body].join("\n");
    // exitCode not provided ΓÇö parser should extract from header.
    const meta: FilterMeta = {
      tool: "run_command",
      command: "npm test",
      exitCode: undefined as unknown as null,
      timedOut: undefined as unknown as false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("filters normally when exitCode is zero", () => {
    const header = ["$ cargo build", "[exit 0]"];
    const body = Array(100).fill("Compiling dep v0.1.0");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "cargo build",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
  });

  it("skips filtering for job_output with non-zero exit", () => {
    const header = ["[job 1 ┬╖ exited 1 ┬╖ byteLength=5000]", "$ npm test"];
    const body = Array(100).fill("FAIL");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "job_output",
      command: "npm test",
      exitCode: 1,
      timedOut: false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("skips filtering for stop_job with non-zero exit", () => {
    const header = ["[job 1 stopped ┬╖ exit 1]", "$ npm test"];
    const body = Array(50).fill("error output");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "stop_job",
      command: "npm test",
      exitCode: 1,
      timedOut: false,
    };
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });
});

// ΓöÇΓöÇ test-output filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("testFilter", () => {
  it("passes through short test output unchanged", () => {
    const formatted = [
      "$ vitest run",
      "[exit 0]",
      "",
      " Γ£ô src/foo.test.ts (2 tests) 5ms",
      "",
      " Test Files  1 passed (1)",
      "      Tests  2 passed (2)",
      "   Start at  12:00:00",
      "   Duration  1.23s",
    ].join("\n");
    const result = testFilter(formatted);
    expect(result.truncated).toBe(false);
    expect(result.output).toContain("Test Files");
  });

  it("compresses long test output with tail-priority window", () => {
    const header = ["$ vitest run", "[exit 0]"];
    const body = Array(100).fill(" Γ£ô src/module/test-NN.test.ts (3 tests) 8ms");
    const summary = [
      "",
      " Test Files  50 passed (50)",
      "      Tests  150 passed (150)",
      "   Duration  12.34s",
    ];
    const formatted = [...header, ...body, ...summary].join("\n");
    const result = testFilter(formatted, { headLines: 5, tailLines: 10 });
    expect(result.truncated).toBe(true);
    // The tail summary is the most valuable ΓÇö should be preserved.
    expect(result.output).toContain("Test Files");
    expect(result.output).toContain("Duration");
  });
});

// ΓöÇΓöÇ build-output filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("buildFilter", () => {
  it("passes through short build output unchanged", () => {
    const formatted = "$ cargo build\n[exit 0]\nFinished dev profile";
    const result = buildFilter(formatted);
    expect(result.truncated).toBe(false);
  });

  it("compresses long build output", () => {
    const header = ["$ cargo build", "[exit 0]"];
    const body = Array(100).fill("Compiling dependency v0.1.0");
    const tail = ["Finished dev profile", "in 45.2s"];
    const formatted = [...header, ...body, ...tail].join("\n");
    const result = buildFilter(formatted, { headLines: 5, tailLines: 5 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("Finished");
  });
});

// ΓöÇΓöÇ lint-output filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("lintFilter", () => {
  it("passes through short lint output unchanged", () => {
    const formatted = "$ eslint src/\n[exit 0]\n0 problems (0 errors, 0 warnings)";
    const result = lintFilter(formatted);
    expect(result.truncated).toBe(false);
  });

  it("compresses long lint output", () => {
    const header = ["$ eslint src/", "[exit 0]"];
    const body = Array(60).fill("src/file.ts:1:1 warning");
    const formatted = [...header, ...body].join("\n");
    const result = lintFilter(formatted);
    expect(result.truncated).toBe(true);
  });
});

// ΓöÇΓöÇ typecheck-output filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("typecheckFilter", () => {
  it("passes through clean typecheck output unchanged", () => {
    const formatted = "$ tsc --noEmit\n[exit 0]";
    const result = typecheckFilter(formatted);
    expect(result.truncated).toBe(false);
  });

  it("compresses verbose typecheck output", () => {
    const header = ["$ tsc --noEmit", "[exit 0]"];
    const body = Array(60).fill("src/types.ts(1,1): info: something");
    const formatted = [...header, ...body].join("\n");
    const result = typecheckFilter(formatted);
    expect(result.truncated).toBe(true);
  });
});

// ΓöÇΓöÇ category routing integration ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("category routing via filterShellOutput", () => {
  afterEach(() => {
    resetRawOutputStore();
    const originalEnv = process.env.REASONIX_OUTPUT_FILTERS;
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, "REASONIX_OUTPUT_FILTERS");
    } else {
      process.env.REASONIX_OUTPUT_FILTERS = originalEnv;
    }
  });

  beforeEach(() => {
    process.env.REASONIX_OUTPUT_FILTERS = "1";
  });

  it("routes git diff to gitDiffFilter", () => {
    resetRawOutputStore();
    const diffHeader = "diff --git a/big.ts b/big.ts";
    const diffLines = Array(100).fill("+line");
    const formatted = [
      "$ git diff",
      "[exit 0]",
      diffHeader,
      "index abc..def",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1,100 +1,100 @@",
      ...diffLines,
    ].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git diff",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).toContain("diff --git");
    // Should have truncated + recovery marker since 100 diff lines.
    expect(result).toContain("raw_output_id=");
  });

  it("routes git log to gitLogFilter", () => {
    resetRawOutputStore();
    const commits = Array(100)
      .fill(0)
      .map((_, i) => `${i.toString(16).padStart(7, "0")} commit ${i}`);
    const formatted = ["$ git log --oneline", "[exit 0]", ...commits].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git log --oneline",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).toContain("commits omitted");
  });

  it("routes git status to gitStatusFilter", () => {
    resetRawOutputStore();
    const formatted = ["$ git status -s", "[exit 0]", "M src/foo.ts", "?? bar.ts"].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git status -s",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).not.toContain("raw_output_id=");
  });

  it("routes test commands to testFilter", () => {
    resetRawOutputStore();
    const header = ["$ vitest run", "[exit 0]"];
    const body = Array(100).fill(" Γ£ô test file");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "vitest run",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
  });

  it("routes build commands to buildFilter", () => {
    resetRawOutputStore();
    const header = ["$ cargo build", "[exit 0]"];
    const body = Array(100).fill("Compiling dep v0.1.0");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "cargo build",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
  });

  it("routes lint commands to lintFilter", () => {
    resetRawOutputStore();
    const header = ["$ eslint src/", "[exit 0]"];
    const body = Array(60).fill("src/file.ts:1:1 warning");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "eslint src/",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
  });

  it("routes typecheck commands to typecheckFilter", () => {
    resetRawOutputStore();
    const header = ["$ tsc --noEmit", "[exit 0]"];
    const body = Array(60).fill("src/types.ts(1,1): info");
    const formatted = [...header, ...body].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "tsc --noEmit",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
  });
});

// ΓöÇΓöÇ Filter line config (env var overrides) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("readFilterLineConfig", () => {
  const envBackup = new Map<string, string | undefined>();

  beforeEach(() => {
    // Snapshot all REASONIX_FILTER_* env vars and clear them.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("REASONIX_FILTER_")) {
        envBackup.set(key, process.env[key]);
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env state.
    for (const [key, val] of envBackup) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    envBackup.clear();
  });

  it("returns defaults when no env vars are set", () => {
    const cfg = readFilterLineConfig();
    expect(cfg.genericHead).toBe(20);
    expect(cfg.genericTail).toBe(30);
    expect(cfg.testHead).toBe(10);
    expect(cfg.testTail).toBe(40);
    expect(cfg.buildHead).toBe(15);
    expect(cfg.buildTail).toBe(25);
    expect(cfg.lintHead).toBe(15);
    expect(cfg.lintTail).toBe(30);
    expect(cfg.typecheckHead).toBe(15);
    expect(cfg.typecheckTail).toBe(30);
    expect(cfg.gitDiffFileHead).toBe(15);
    expect(cfg.gitDiffTail).toBe(20);
    expect(cfg.gitLogHead).toBe(25);
    expect(cfg.gitLogTail).toBe(15);
    expect(cfg.gitStatusHead).toBe(50);
    expect(cfg.gitStatusTail).toBe(30);
    expect(cfg.logHead).toBe(15);
    expect(cfg.logTail).toBe(30);
    expect(cfg.logMaxConsecutiveDupes).toBe(3);
  });

  it("overrides generic head/tail via env", () => {
    process.env.REASONIX_FILTER_GENERIC_HEAD = "5";
    process.env.REASONIX_FILTER_GENERIC_TAIL = "8";
    const cfg = readFilterLineConfig();
    expect(cfg.genericHead).toBe(5);
    expect(cfg.genericTail).toBe(8);
  });

  it("overrides test head/tail via env", () => {
    process.env.REASONIX_FILTER_TEST_HEAD = "3";
    process.env.REASONIX_FILTER_TEST_TAIL = "12";
    const cfg = readFilterLineConfig();
    expect(cfg.testHead).toBe(3);
    expect(cfg.testTail).toBe(12);
  });

  it("ignores non-numeric env values and falls back to defaults", () => {
    process.env.REASONIX_FILTER_BUILD_HEAD = "abc";
    const cfg = readFilterLineConfig();
    expect(cfg.buildHead).toBe(15); // default
  });

  it("ignores negative env values and falls back to defaults", () => {
    process.env.REASONIX_FILTER_LINT_HEAD = "-5";
    const cfg = readFilterLineConfig();
    expect(cfg.lintHead).toBe(15); // default
  });

  it("overrides git-diff file head and tail via env", () => {
    process.env.REASONIX_FILTER_GIT_DIFF_FILE_HEAD = "7";
    process.env.REASONIX_FILTER_GIT_DIFF_TAIL = "9";
    const cfg = readFilterLineConfig();
    expect(cfg.gitDiffFileHead).toBe(7);
    expect(cfg.gitDiffTail).toBe(9);
  });

  it("overrides git-log head/tail via env", () => {
    process.env.REASONIX_FILTER_GIT_LOG_HEAD = "10";
    process.env.REASONIX_FILTER_GIT_LOG_TAIL = "5";
    const cfg = readFilterLineConfig();
    expect(cfg.gitLogHead).toBe(10);
    expect(cfg.gitLogTail).toBe(5);
  });

  it("overrides git-status head/tail via env", () => {
    process.env.REASONIX_FILTER_GIT_STATUS_HEAD = "20";
    process.env.REASONIX_FILTER_GIT_STATUS_TAIL = "15";
    const cfg = readFilterLineConfig();
    expect(cfg.gitStatusHead).toBe(20);
    expect(cfg.gitStatusTail).toBe(15);
  });

  it("overrides typecheck head/tail via env", () => {
    process.env.REASONIX_FILTER_TYPECHECK_HEAD = "5";
    process.env.REASONIX_FILTER_TYPECHECK_TAIL = "10";
    const cfg = readFilterLineConfig();
    expect(cfg.typecheckHead).toBe(5);
    expect(cfg.typecheckTail).toBe(10);
  });

  it("clamps env values above MAX_LINE_LINES (500) to the ceiling", () => {
    process.env.REASONIX_FILTER_TEST_HEAD = "999999";
    const cfg = readFilterLineConfig();
    expect(cfg.testHead).toBe(500);
  });

  it("clamps env values above MAX_ENTRIES (1000) for entry-count knobs", () => {
    process.env.REASONIX_FILTER_FS_MAX_ENTRIES = "9999999";
    const cfg = readFilterLineConfig();
    expect(cfg.fsMaxEntries).toBe(1000);
  });

  it("clamps env values above MAX_DEPTH (10) for jsonMaxDepth", () => {
    process.env.REASONIX_FILTER_JSON_MAX_DEPTH = "999";
    const cfg = readFilterLineConfig();
    expect(cfg.jsonMaxDepth).toBe(10);
  });

  it("clamps env values above MAX_VALUE_LENGTH (10000) for jsonMaxValueLength", () => {
    process.env.REASONIX_FILTER_JSON_MAX_VALUE_LEN = "999999";
    const cfg = readFilterLineConfig();
    expect(cfg.jsonMaxValueLength).toBe(10000);
  });

  it("allows values within the max range", () => {
    process.env.REASONIX_FILTER_TEST_HEAD = "100";
    const cfg = readFilterLineConfig();
    expect(cfg.testHead).toBe(100);
  });
});

// ΓöÇΓöÇ Filter options acceptance (lint/typecheck/git-status accept opts) ΓöÇ

describe("filter options wiring", () => {
  it("lintFilter accepts custom head/tail options", () => {
    const header = "$ eslint src/\n[exit 0]\n";
    const body = Array(80).fill("src/file.ts:1:1 warning").join("\n");
    const formatted = header + body;
    const defaultResult = lintFilter(formatted);
    const customResult = lintFilter(formatted, { headLines: 2, tailLines: 3 });
    expect(customResult.output.length).toBeLessThan(defaultResult.output.length);
  });

  it("typecheckFilter accepts custom head/tail options", () => {
    const header = "$ tsc --noEmit\n[exit 0]\n";
    const body = Array(80).fill("src/types.ts(1,1): info").join("\n");
    const formatted = header + body;
    const defaultResult = typecheckFilter(formatted);
    const customResult = typecheckFilter(formatted, { headLines: 2, tailLines: 3 });
    expect(customResult.output.length).toBeLessThan(defaultResult.output.length);
  });

  it("gitStatusFilter accepts custom head/tail options", () => {
    const header = "$ git status -s\n[exit 0]\n";
    // Use proper 2-char short-format status codes so gitStatusFilter routes
    // to the short-format branch where custom opts are applied.
    const body = Array(100)
      .fill(0)
      .map((_, i) => `M  src/file${i}.ts`)
      .join("\n");
    const formatted = header + body;
    const defaultResult = gitStatusFilter(formatted);
    const customResult = gitStatusFilter(formatted, { headLines: 2, tailLines: 3 });
    expect(customResult.output.length).toBeLessThan(defaultResult.output.length);
  });
});

// ΓöÇΓöÇ log-output filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("logFilter", () => {
  it("passes through short log output unchanged", () => {
    const formatted = [
      "[job 1 started ┬╖ pid 123 ┬╖ READY signal matched]",
      "vite dev server ready",
      "Local: http://localhost:5173/",
    ].join("\n");
    const result = logFilter(formatted);
    expect(result.truncated).toBe(false);
    expect(result.output).toContain("vite dev server ready");
    expect(result.output).toContain("localhost:5173");
  });

  it("passes through empty output", () => {
    const result = logFilter("");
    expect(result.output).toBe("");
    expect(result.rawChars).toBe(0);
  });

  it("collapses consecutive duplicate lines", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 1234 ┬╖ byteLength=5000]", "$ npm run dev"];
    const body = [
      "vite v5.0.0 dev server ready",
      "Local: http://localhost:5173/",
      ...Array(20).fill("4:23:01 PM [vite] hmr update /src/App.tsx"),
      "Network: http://192.168.1.1:5173/",
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 15, tailLines: 5, maxConsecutiveDupes: 3 });
    expect(result.output).toContain("repeated lines omitted");
    // Original 20 duplicates should be reduced to 3 + summary.
    const hmrCount = result.output.split("hmr update").length - 1;
    expect(hmrCount).toBe(3);
  });

  it("preserves readiness signals in startup preview", () => {
    const header = ["[job 1 started ┬╖ pid 123 ┬╖ READY signal matched]"];
    const body = [
      "compiling modules...",
      ...Array(50).fill("  processing module N"),
      "vite dev server ready",
      "Local: http://localhost:5173/",
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 10, tailLines: 5, maxConsecutiveDupes: 3 });
    // Readiness signal is an important line ΓÇö should appear even if outside window.
    expect(result.output).toContain("Local: http://localhost:5173/");
  });

  it("preserves error lines from omitted output", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 1234 ┬╖ byteLength=88120]", "$ npm run dev"];
    // Create enough unique lines that after dedup the body still exceeds headLines+tailLines.
    const hmrBlock = Array.from({ length: 80 }, (_, i) => ` HMR update /src/mod${i}.tsx`);
    const body = [
      "vite v5.0.0 dev server ready",
      "Local: http://localhost:5173/",
      ...hmrBlock,
      "Error: Cannot find module './utils'",
      ...Array.from({ length: 40 }, (_, i) => ` HMR update /src/other${i}.tsx`),
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 5, tailLines: 5, maxConsecutiveDupes: 3 });
    // Error line should be pulled into "Important lines" section.
    expect(result.output).toContain("Error: Cannot find module");
    expect(result.output).toContain("Important lines from omitted output");
  });

  it("preserves warning lines from omitted output", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 1234 ┬╖ byteLength=50000]", "$ tsc --watch"];
    const checkBlock = Array.from({ length: 60 }, (_, i) => ` checking file${i}.ts`);
    const trailingBlock = Array.from({ length: 40 }, (_, i) => ` checking other${i}.ts`);
    const body = [
      "Starting compilation...",
      ...checkBlock,
      "warning: 'x' is declared but never read",
      ...trailingBlock,
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 5, tailLines: 5, maxConsecutiveDupes: 3 });
    expect(result.output).toContain("warning");
  });

  it("handles job_output format with byteLength header", () => {
    const header = ["[job 3 ┬╖ running ┬╖ pid 456 ┬╖ byteLength=881204]", "$ vite"];
    // Use unique lines so dedup doesn't collapse them all ΓÇö body must exceed headLines+tailLines.
    const hmrLines = Array.from({ length: 200 }, (_, i) => ` HMR update /src/comp${i}.tsx`);
    const body = [
      "vite dev server ready",
      "Local: http://localhost:5173/",
      ...hmrLines,
      "Network: http://192.168.1.1:5173/",
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 10, tailLines: 10, maxConsecutiveDupes: 3 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("[job 3");
  });

  it("handles stop_job format with exit header", () => {
    const header = ["[job 2 stopped ┬╖ exit 0]", "$ npm run build"];
    const body = [...Array(100).fill("  building module N"), "Build completed successfully"];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 5, tailLines: 5, maxConsecutiveDupes: 3 });
    expect(result.output).toContain("[job 2 stopped");
    expect(result.output).toContain("Build completed successfully");
  });

  it("does not collapse non-consecutive similar lines", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 123 ┬╖ byteLength=5000]", "$ npm run dev"];
    const body = [
      "HMR update /src/A.tsx",
      "HMR update /src/B.tsx",
      "HMR update /src/A.tsx",
      "HMR update /src/C.tsx",
    ];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 10, tailLines: 10, maxConsecutiveDupes: 2 });
    // These are not consecutive duplicates ΓÇö no collapsing should occur.
    expect(result.output).not.toContain("repeated lines omitted");
    expect(result.truncated).toBe(false);
  });

  it("maxConsecutiveDupes=1 collapses any run of 2+ identical lines", () => {
    const header = ["[job 1 ┬╖ running ┬╖ pid 99 ┬╖ byteLength=500]", "$ watch"];
    const body = ["watching for changes", "line A", "line A", "line A", "done"];
    const formatted = [...header, ...body].join("\n");
    const result = logFilter(formatted, { headLines: 10, tailLines: 10, maxConsecutiveDupes: 1 });
    expect(result.output).toContain("repeated lines omitted");
    // Should keep only 1 copy of "line A" + summary of 2 omitted.
    const lineACount = result.output.split("line A").length - 1;
    expect(lineACount).toBe(1);
  });
});

// ΓöÇΓöÇ Job tool routing via filterShellOutput ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("job tool routing via filterShellOutput", () => {
  const originalEnv = process.env.REASONIX_OUTPUT_FILTERS;

  afterEach(() => {
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, "REASONIX_OUTPUT_FILTERS");
    } else {
      process.env.REASONIX_OUTPUT_FILTERS = originalEnv;
    }
    resetRawOutputStore();
  });

  beforeEach(() => {
    process.env.REASONIX_OUTPUT_FILTERS = "1";
  });

  it("routes run_background to logFilter", () => {
    resetRawOutputStore();
    const formatted = [
      "[job 1 started ┬╖ pid 123 ┬╖ READY signal matched]",
      "vite dev server ready",
      "Local: http://localhost:5173/",
      ...Array(100).fill("  HMR update /src/App.tsx"),
    ].join("\n");
    const meta: FilterMeta = {
      tool: "run_background",
      command: "npm run dev",
      exitCode: null,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    // Should have collapsed the repeated HMR lines.
    expect(result.length).toBeLessThan(formatted.length);
    expect(result).toContain("Local: http://localhost:5173/");
  });

  it("routes job_output to logFilter", () => {
    resetRawOutputStore();
    const formatted = [
      "[job 1 ┬╖ running ┬╖ pid 123 ┬╖ byteLength=88000]",
      "$ npm run dev",
      "vite dev server ready",
      "Local: http://localhost:5173/",
      ...Array(100).fill("  HMR update /src/App.tsx"),
    ].join("\n");
    const meta: FilterMeta = {
      tool: "job_output",
      command: "npm run dev",
      exitCode: null,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
    expect(result).toContain("localhost:5173");
  });

  it("routes stop_job to logFilter", () => {
    resetRawOutputStore();
    const formatted = [
      "[job 1 stopped ┬╖ exit 0]",
      "$ npm run build",
      ...Array(100).fill("  building module N"),
      "Build completed",
    ].join("\n");
    const meta: FilterMeta = {
      tool: "stop_job",
      command: "npm run build",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result.length).toBeLessThan(formatted.length);
    expect(result).toContain("Build completed");
  });

  it("still skips filtering for stop_job with non-zero exit", () => {
    resetRawOutputStore();
    const formatted = [
      "[job 1 stopped ┬╖ exit 1]",
      "$ npm run build",
      ...Array(100).fill("error: build failed"),
    ].join("\n");
    const meta: FilterMeta = {
      tool: "stop_job",
      command: "npm run build",
      exitCode: 1,
      timedOut: false,
    };
    // Error-aware: non-zero exit ΓåÆ passthrough.
    expect(filterShellOutput(formatted, meta)).toBe(formatted);
  });

  it("adds recovery marker for compressed job output", () => {
    resetRawOutputStore();
    const hmrLines = Array.from({ length: 100 }, (_, i) => ` HMR update /src/comp${i}.tsx`);
    const formatted = [
      "[job 1 ┬╖ running ┬╖ pid 123 ┬╖ byteLength=50000]",
      "$ npm run dev",
      ...hmrLines,
    ].join("\n");
    const meta: FilterMeta = {
      tool: "job_output",
      command: "npm run dev",
      exitCode: null,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).toContain("raw_output_id=");
  });
});

// ΓöÇΓöÇ Log filter line config (env var overrides) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("readFilterLineConfig ΓÇö log settings", () => {
  const envBackup = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("REASONIX_FILTER_LOG")) {
        envBackup.set(key, process.env[key]);
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    for (const [key, val] of envBackup) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    envBackup.clear();
  });

  it("returns log defaults when no env vars are set", () => {
    const cfg = readFilterLineConfig();
    expect(cfg.logHead).toBe(15);
    expect(cfg.logTail).toBe(30);
    expect(cfg.logMaxConsecutiveDupes).toBe(3);
  });

  it("overrides log head/tail via env", () => {
    process.env.REASONIX_FILTER_LOG_HEAD = "5";
    process.env.REASONIX_FILTER_LOG_TAIL = "10";
    const cfg = readFilterLineConfig();
    expect(cfg.logHead).toBe(5);
    expect(cfg.logTail).toBe(10);
  });

  it("overrides log max consecutive dupes via env", () => {
    process.env.REASONIX_FILTER_LOG_MAX_DUPE = "1";
    const cfg = readFilterLineConfig();
    expect(cfg.logMaxConsecutiveDupes).toBe(1);
  });

  it("ignores non-numeric log env values", () => {
    process.env.REASONIX_FILTER_LOG_HEAD = "abc";
    const cfg = readFilterLineConfig();
    expect(cfg.logHead).toBe(15);
  });
});

// ΓöÇΓöÇ Command normalizer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("normalizeCommand", () => {
  afterEach(() => {
    process.env.REASONIX_NORMALIZATION = undefined;
  });

  it("adds --output-format json to ruff check", () => {
    const r = normalizeCommand("ruff check src/");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("ruff check src/ --output-format json");
    expect(r.displayCommand).toBe("ruff check src/");
    expect(r.description).toBe("--output-format json");
  });

  it("adds -f json to eslint", () => {
    const r = normalizeCommand("eslint .");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("eslint . -f json");
    expect(r.displayCommand).toBe("eslint .");
    expect(r.description).toBe("-f json");
  });

  it("inserts -json flag after go test", () => {
    const r = normalizeCommand("go test ./...");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("go test -json ./...");
    expect(r.displayCommand).toBe("go test ./...");
    expect(r.description).toBe("-json");
  });

  it("adds --pretty false to tsc --noEmit", () => {
    const r = normalizeCommand("tsc --noEmit");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("tsc --noEmit --pretty false");
    expect(r.displayCommand).toBe("tsc --noEmit");
    expect(r.description).toBe("--pretty false");
  });

  it("does not normalize tsc without --noEmit (would emit files)", () => {
    const r = normalizeCommand("tsc");
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("tsc");
  });

  it("adds --output json to mypy", () => {
    const r = normalizeCommand("mypy src/");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("mypy src/ --output json");
    expect(r.displayCommand).toBe("mypy src/");
    expect(r.description).toBe("--output json");
  });

  it("skips normalization when eslint already has -f flag", () => {
    const r = normalizeCommand("eslint . -f stylish");
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("eslint . -f stylish");
  });

  it("skips normalization when eslint already has --format flag", () => {
    const r = normalizeCommand("eslint . --format=compact");
    expect(r.normalized).toBe(false);
  });

  it("skips normalization when ruff check already has --output-format", () => {
    const r = normalizeCommand("ruff check --output-format=text src/");
    expect(r.normalized).toBe(false);
  });

  it("skips normalization when go test already has -json", () => {
    const r = normalizeCommand("go test -json ./...");
    expect(r.normalized).toBe(false);
  });

  it("skips normalization when tsc already has --pretty", () => {
    const r = normalizeCommand("tsc --noEmit --pretty true");
    expect(r.normalized).toBe(false);
  });

  it("skips normalization when mypy already has --output", () => {
    const r = normalizeCommand("mypy --output=text src/");
    expect(r.normalized).toBe(false);
  });

  it("handles npx-prefixed eslint", () => {
    const r = normalizeCommand("npx eslint .");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("npx eslint . -f json");
  });

  it("handles pnpm-prefixed ruff check", () => {
    const r = normalizeCommand("pnpm ruff check src/");
    expect(r.normalized).toBe(true);
    expect(r.executedCommand).toBe("pnpm ruff check src/ --output-format json");
  });

  it("does not normalize unknown commands", () => {
    const r = normalizeCommand("python script.py");
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("python script.py");
  });

  it("does not normalize git status", () => {
    const r = normalizeCommand("git status");
    expect(r.normalized).toBe(false);
  });

  it("disables normalization when REASONIX_NORMALIZATION=off", () => {
    process.env.REASONIX_NORMALIZATION = "off";
    const r = normalizeCommand("ruff check src/");
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("ruff check src/");
  });

  it("disables normalization when REASONIX_NORMALIZATION=false", () => {
    process.env.REASONIX_NORMALIZATION = "false";
    const r = normalizeCommand("eslint .");
    expect(r.normalized).toBe(false);
  });

  it("disables normalization when REASONIX_NORMALIZATION=0", () => {
    process.env.REASONIX_NORMALIZATION = "0";
    const r = normalizeCommand("go test ./...");
    expect(r.normalized).toBe(false);
  });

  it("normalizationEnabled returns true by default", () => {
    expect(normalizationEnabled()).toBe(true);
  });

  it("normalizationEnabled returns false when env is off", () => {
    process.env.REASONIX_NORMALIZATION = "off";
    expect(normalizationEnabled()).toBe(false);
  });

  it("displayCommand always matches input, even after normalization", () => {
    const cmd = "eslint src/ lib/ --ext .ts";
    const r = normalizeCommand(cmd);
    expect(r.displayCommand).toBe(cmd);
  });

  it("raw option bypasses normalization entirely", () => {
    const r = normalizeCommand("ruff check src/", { raw: true });
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("ruff check src/");
    expect(r.displayCommand).toBe("ruff check src/");
  });

  it("raw option bypasses normalization for eslint", () => {
    const r = normalizeCommand("eslint .", { raw: true });
    expect(r.normalized).toBe(false);
    expect(r.executedCommand).toBe("eslint .");
  });

  it("raw option with quoted path preserves quotes", () => {
    const cmd = 'eslint "path with spaces"';
    const r = normalizeCommand(cmd, { raw: true });
    expect(r.executedCommand).toBe(cmd);
    expect(r.normalized).toBe(false);
  });

  it("normalizeCommand with quoted paths uses tokenizer correctly", () => {
    const r = normalizeCommand('eslint "src/lib"');
    expect(r.normalized).toBe(true);
    // tokenizeCommand strips quotes: tokens = ["eslint", "src/lib"]
    expect(r.executedCommand).toBe("eslint src/lib -f json");
  });
});

// ΓöÇΓöÇ Filesystem listing filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("fsListingFilter", () => {
  it("passes through short listings unchanged", () => {
    const input = "$ ls\nsrc\nlib\npackage.json";
    const r = fsListingFilter(input, { maxEntries: 50, headLines: 20, tailLines: 30 });
    expect(r.truncated).toBe(false);
    expect(r.output).toBe(input);
  });

  it("passes through empty output", () => {
    const r = fsListingFilter("", { maxEntries: 50, headLines: 20, tailLines: 30 });
    expect(r.output).toBe("");
    expect(r.truncated).toBe(false);
  });

  it("passes through header-only output", () => {
    const input = "$ ls\n[exit 0]";
    const r = fsListingFilter(input, { maxEntries: 50, headLines: 20, tailLines: 30 });
    expect(r.truncated).toBe(false);
  });

  it("compresses large listings by preserving important files", () => {
    const files: string[] = [];
    for (let i = 0; i < 100; i++) {
      files.push(`file-${i.toString().padStart(3, "0")}.txt`);
    }
    // Add important files that should be preserved.
    files.push("package.json", "src", "README.md", "tsconfig.json");
    const input = `$ ls\n${files.join("\n")}`;
    const r = fsListingFilter(input, { maxEntries: 20, headLines: 5, tailLines: 5 });
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("package.json");
    expect(r.output).toContain("src");
    expect(r.output).toContain("omitted");
  });

  it("preserves permission denied error lines", () => {
    const files: string[] = [];
    for (let i = 0; i < 80; i++) {
      files.push(`dir-${i.toString().padStart(3, "0")}/`);
    }
    files.push("dir-secret/: Permission denied");
    const input = `$ ls\n${files.join("\n")}`;
    const r = fsListingFilter(input, { maxEntries: 20, headLines: 5, tailLines: 5 });
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("Permission denied");
  });

  it("falls through to generic for tree-style output", () => {
    const input =
      "$ tree\n.\nΓö£ΓöÇΓöÇ src/\nΓöé   Γö£ΓöÇΓöÇ index.ts\nΓöé   ΓööΓöÇΓöÇ utils.ts\nΓööΓöÇΓöÇ package.json\n2 directories, 3 files";
    const r = fsListingFilter(input, { maxEntries: 50, headLines: 20, tailLines: 30 });
    // Tree-style gets generic filter which doesn't truncate small output.
    expect(r.truncated).toBe(false);
  });

  it("handles find-style path-per-line output", () => {
    const paths: string[] = [];
    for (let i = 0; i < 60; i++) {
      paths.push(`./src/module${i}/index.ts`);
    }
    const input = `$ find . -name '*.ts'\n${paths.join("\n")}`;
    const r = fsListingFilter(input, { maxEntries: 30, headLines: 5, tailLines: 5 });
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("omitted");
  });

  it("groups important files at the top of truncated output", () => {
    const files: string[] = [];
    for (let i = 0; i < 80; i++) {
      files.push(`item-${i}.log`);
    }
    files.push("Cargo.toml", ".env", "test/");
    const input = `$ ls\n${files.join("\n")}`;
    const r = fsListingFilter(input, { maxEntries: 15, headLines: 5, tailLines: 5 });
    expect(r.truncated).toBe(true);
    // Important files should appear before the omission marker.
    const markerIdx = r.output.indexOf("omitted");
    const cargoIdx = r.output.indexOf("Cargo.toml");
    const envIdx = r.output.indexOf(".env");
    expect(cargoIdx).toBeLessThan(markerIdx);
    expect(envIdx).toBeLessThan(markerIdx);
  });
});

// ΓöÇΓöÇ Search filter ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("searchFilter", () => {
  it("passes through short search results unchanged", () => {
    const input =
      "$ grep TODO src/main.ts\nsrc/main.ts:10:// TODO: fix this\nsrc/main.ts:25:// TODO: refactor";
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(false);
  });

  it("passes through no-match output", () => {
    const input = "$ grep TODO src/\n[exit 1]";
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(false);
  });

  it("compresses many matches in a single file", () => {
    const matches: string[] = [];
    for (let i = 1; i <= 30; i++) {
      matches.push(`src/app.ts:${i * 10}:const x${i} = ${i};`);
    }
    const input = `$ grep const src/app.ts\n${matches.join("\n")}`;
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("more matches");
  });

  it("compresses many files with matches", () => {
    const lines: string[] = [];
    for (let f = 0; f < 25; f++) {
      lines.push(`src/file${f}.ts:1:import React from 'react';`);
    }
    const input = `$ grep React src/\n${lines.join("\n")}`;
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 10,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("more files");
  });

  it("groups matches by file", () => {
    const input = [
      "$ rg TODO",
      "src/a.ts:1:// TODO a1",
      "src/a.ts:5:// TODO a2",
      "src/b.ts:3:// TODO b1",
      "src/b.ts:7:// TODO b2",
      "src/c.ts:2:// TODO c1",
    ].join("\n");
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(false);
    // All files should be present.
    expect(r.output).toContain("src/a.ts");
    expect(r.output).toContain("src/b.ts");
    expect(r.output).toContain("src/c.ts");
  });

  it("handles ripgrep heading-style output", () => {
    const input = [
      "$ rg --heading TODO",
      "src/app.ts",
      "10:// TODO: fix login",
      "25:// TODO: add tests",
      "src/utils.ts",
      "3:// TODO: refactor",
    ].join("\n");
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(false);
    expect(r.output).toContain("src/app.ts");
    expect(r.output).toContain("src/utils.ts");
  });

  it("falls through to generic for non-search-like output", () => {
    const input = "$ grep pattern file.txt\nsome output without colons and line numbers here";
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 5,
      tailLines: 5,
    });
    // No inline path:number pattern ΓåÆ falls to generic filter.
    expect(r.truncated).toBe(false);
  });

  it("passes through empty output", () => {
    const r = searchFilter("", {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.output).toBe("");
    expect(r.truncated).toBe(false);
  });

  it("handles mixed findstr output format", () => {
    const input = [
      '$ findstr /s "TODO" *.ts',
      "src\\main.ts:10:// TODO: fix",
      "src\\main.ts:25:// TODO: refactor",
      "src\\utils.ts:3:// TODO: cleanup",
    ].join("\n");
    const r = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 15,
      headLines: 20,
      tailLines: 30,
    });
    expect(r.truncated).toBe(false);
  });
});

// ΓöÇΓöÇ Telemetry ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("Filter telemetry", () => {
  beforeEach(() => {
    resetFilterTelemetryStore();
  });

  afterEach(() => {
    resetFilterTelemetryStore();
  });

  it("records a filter invocation", () => {
    const store = getFilterTelemetryStore();
    recordFilterTelemetryDirect({
      command: "git diff",
      filterKind: "git-diff",
      rawChars: 10000,
      filteredChars: 2000,
      rawOutputId: null,
      fallbackUsed: false,
    });
    const entries = store.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.command).toBe("git diff");
    expect(entries[0]!.filterKind).toBe("git-diff");
    expect(entries[0]!.savingsPct).toBe(80);
  });

  it("computes session summary", () => {
    const store = getFilterTelemetryStore();
    recordFilterTelemetryDirect({
      command: "git diff",
      filterKind: "git-diff",
      rawChars: 10000,
      filteredChars: 2000,
      rawOutputId: null,
      fallbackUsed: false,
    });
    recordFilterTelemetryDirect({
      command: "npm test",
      filterKind: "test",
      rawChars: 50000,
      filteredChars: 5000,
      rawOutputId: 1,
      fallbackUsed: false,
    });
    const summary = store.getSummary();
    expect(summary.totalCalls).toBe(2);
    expect(summary.filteredCalls).toBe(2);
    expect(summary.fallbackCalls).toBe(0);
    expect(summary.totalRawChars).toBe(60000);
    expect(summary.totalFilteredChars).toBe(7000);
    expect(summary.estimatedSavedTokens).toBeGreaterThan(0);
  });

  it("tracks fallbacks separately", () => {
    const store = getFilterTelemetryStore();
    recordFilterTelemetryDirect({
      command: "unknown-cmd",
      filterKind: "fallback",
      rawChars: 1000,
      filteredChars: 1000,
      rawOutputId: null,
      fallbackUsed: true,
    });
    const summary = store.getSummary();
    expect(summary.fallbackCalls).toBe(1);
    expect(summary.filteredCalls).toBe(0);
  });

  it("formatSummary produces human-readable output", () => {
    const store = getFilterTelemetryStore();
    recordFilterTelemetryDirect({
      command: "git diff",
      filterKind: "git-diff",
      rawChars: 1_000_000,
      filteredChars: 100_000,
      rawOutputId: null,
      fallbackUsed: false,
    });
    const text = store.formatSummary();
    expect(text).toContain("1.0M chars");
    expect(text).toContain("100.0k chars");
    expect(text).toContain("tokens");
    expect(text).toContain("average savings:");
  });

  it("formatSummary handles empty store", () => {
    const store = getFilterTelemetryStore();
    expect(store.formatSummary()).toBe("No filter activity recorded.");
  });

  it("telemetry records via filterShellOutput integration", () => {
    resetFilterTelemetryStore();
    // Large output that will be truncated by generic filter.
    const lines = ["$ ls", ...Array.from({ length: 100 }, (_, i) => `file-${i}.txt`)];
    const input = lines.join("\n");
    filterShellOutput(input, { tool: "run_command", command: "ls", exitCode: 0 });
    const store = getFilterTelemetryStore();
    const entries = store.getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.filterKind).toBe("ls-tree");
  });

  it("error-bypass records telemetry with zero savings", () => {
    resetFilterTelemetryStore();
    const input = "$ bad-cmd\n[exit 1]\nerror output";
    filterShellOutput(input, { tool: "run_command", command: "bad-cmd", exitCode: 1 });
    const store = getFilterTelemetryStore();
    const entries = store.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.filterKind).toBe("error-bypass");
    expect(entries[0]!.savingsPct).toBe(0);
  });
});

/** Direct telemetry recording helper for unit tests. */
function recordFilterTelemetryDirect(opts: {
  command: string;
  filterKind: string;
  rawChars: number;
  filteredChars: number;
  rawOutputId: number | null;
  fallbackUsed: boolean;
}): void {
  getFilterTelemetryStore().record({
    command: opts.command,
    filterKind: opts.filterKind,
    rawChars: opts.rawChars,
    filteredChars: opts.filteredChars,
    estimatedRawTokens: Math.round(opts.rawChars / 4),
    estimatedFilteredTokens: Math.round(opts.filteredChars / 4),
    savingsPct:
      opts.rawChars > 0
        ? Math.round(((opts.rawChars - opts.filteredChars) / opts.rawChars) * 100)
        : 0,
    rawOutputId: opts.rawOutputId,
    fallbackUsed: opts.fallbackUsed,
    timestamp: Date.now(),
  });
}

describe("isVerboseCommand", () => {
  it("detects --verbose flag", () => {
    expect(isVerboseCommand("npm run build --verbose")).toBe(true);
  });

  it("detects -vvv multi-v flag", () => {
    expect(isVerboseCommand("ssh -vvv host")).toBe(true);
  });

  it("detects --debug flag", () => {
    expect(isVerboseCommand("curl --debug https://example.com")).toBe(true);
  });

  it("detects --full flag", () => {
    expect(isVerboseCommand("git log --full")).toBe(true);
  });

  it("detects --detailed flag", () => {
    expect(isVerboseCommand("some-tool --detailed")).toBe(true);
  });

  it("detects --show-all flag", () => {
    expect(isVerboseCommand("grep --show-all pattern")).toBe(true);
  });

  it("detects --no-summary flag", () => {
    expect(isVerboseCommand("pytest --no-summary")).toBe(true);
  });

  it("returns false for normal commands", () => {
    expect(isVerboseCommand("git status")).toBe(false);
  });

  it("returns false for -v single flag (ambiguous, could mean invert)", () => {
    // Single -v is intentionally excluded ΓÇö too ambiguous (grep -v = invert)
    expect(isVerboseCommand("grep -v pattern")).toBe(false);
  });
});

describe("boostForVerbose", () => {
  it("doubles all head/tail/entry limits", () => {
    const lc = readFilterLineConfig();
    const boosted = boostForVerbose(lc);
    expect(boosted.genericHead).toBe(lc.genericHead * 2);
    expect(boosted.genericTail).toBe(lc.genericTail * 2);
    expect(boosted.fsMaxEntries).toBe(lc.fsMaxEntries * 2);
    expect(boosted.searchMaxMatchesPerFile).toBe(lc.searchMaxMatchesPerFile * 2);
  });

  it("does not double non-limit fields", () => {
    const lc = readFilterLineConfig();
    const boosted = boostForVerbose(lc);
    expect(boosted.jsonMaxDepth).toBe(lc.jsonMaxDepth);
    expect(boosted.jsonMaxValueLength).toBe(lc.jsonMaxValueLength);
  });

  it("does not change logMaxConsecutiveDupes", () => {
    const lc = readFilterLineConfig();
    const boosted = boostForVerbose(lc);
    expect(boosted.logMaxConsecutiveDupes).toBe(lc.logMaxConsecutiveDupes);
  });
});
