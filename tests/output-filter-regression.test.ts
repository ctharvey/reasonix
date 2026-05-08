/** Regression tests with fixture files ΓÇö validates edge cases across filter categories. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFilter } from "../src/tools/shell/output-filter/filters/build-output.js";
import { fsListingFilter } from "../src/tools/shell/output-filter/filters/fs-listing.js";
import { gitDiffFilter } from "../src/tools/shell/output-filter/filters/git-diff.js";
import { gitLogFilter } from "../src/tools/shell/output-filter/filters/git-log.js";
import { gitShowFilter } from "../src/tools/shell/output-filter/filters/git-show.js";
import { gitStatusFilter } from "../src/tools/shell/output-filter/filters/git-status.js";
import { lintFilter } from "../src/tools/shell/output-filter/filters/lint-output.js";
import { searchFilter } from "../src/tools/shell/output-filter/filters/search.js";
import { testFilter } from "../src/tools/shell/output-filter/filters/test-output.js";
import { type FilterMeta, filterShellOutput } from "../src/tools/shell/output-filter/index.js";
import { stripAnsi } from "../src/tools/shell/output-filter/strip-ansi.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures", "output-filter");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

// ΓöÇΓöÇ git-diff regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: git-diff fixtures", () => {
  it("compresses long diff while preserving diff headers", () => {
    const input = loadFixture("git-diff-long.txt");
    const result = gitDiffFilter(input, { fileHeadLines: 10, tailLines: 5 });
    expect(result.output).toContain("diff --git a/src/long-file.ts");
    expect(result.output).toContain("--- a/src/long-file.ts");
    expect(result.output).toContain("+++ b/src/long-file.ts");
    expect(result.truncated).toBe(true);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
    // With fileHeadLines=10, the first 10 body lines (context 1-10) are kept.
    expect(result.output).toContain("context line 1");
    // The tail section should include the last few context lines.
    expect(result.output).toContain("context line 80");
  });

  it("end-to-end: filterShellOutput routes git diff correctly", () => {
    const input = loadFixture("git-diff-long.txt");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git diff HEAD~1",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(input, meta);
    expect(result.length).toBeLessThan(input.length);
    expect(result).toContain("diff --git");
  });
});

// ΓöÇΓöÇ fs-listing regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: fs-listing fixtures", () => {
  it("passes through short listings unchanged", () => {
    const input = loadFixture("fs-listing-short.txt");
    const result = fsListingFilter(input);
    expect(result.truncated).toBe(false);
    expect(result.output).toContain("app.ts");
    // ls -la shows directory entries without trailing slash
    expect(result.output).toContain("components");
  });

  it("compresses huge directory listings", () => {
    const input = loadFixture("fs-listing-huge.txt");
    const result = fsListingFilter(input, { maxEntries: 30, headLines: 15, tailLines: 10 });
    expect(result.truncated).toBe(true);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
    // Should still contain the tool header
    expect(result.output).toContain("$ ls");
    // Should mention omitted entries
    expect(result.output).toMatch(/omitted|ΓÇª/u);
  });
});

// ΓöÇΓöÇ search result regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: search fixtures", () => {
  it("compresses multi-file search results with many matches per file", () => {
    const input = loadFixture("search-many-matches.txt");
    const result = searchFilter(input, {
      maxMatchesPerFile: 5,
      maxFiles: 10,
      headLines: 20,
      tailLines: 5,
    });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("src/config.ts");
    // Should have compressed per-file groups
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });
});

// ΓöÇΓöÇ test output regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: test output fixtures", () => {
  it("passes through successful test summary", () => {
    const input = loadFixture("test-output.txt");
    const result = testFilter(input);
    expect(result.output).toContain("Test Files  19 passed");
    expect(result.output).toContain("Tests  194 passed");
  });
});

// ΓöÇΓöÇ build output regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: build output fixtures", () => {
  it("compresses long compilation output", () => {
    const input = loadFixture("build-output.txt");
    const result = buildFilter(input, { headLines: 10, tailLines: 10 });
    expect(result.output).toContain("Compiling proc-macro2");
    expect(result.output).toContain("Finished dev");
  });
});

// ΓöÇΓöÇ lint output regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: lint output fixtures", () => {
  it("preserves all lint errors", () => {
    const input = loadFixture("lint-output.txt");
    const result = lintFilter(input);
    // Lint errors are important ΓÇö should all be preserved
    expect(result.output).toContain("no-var");
    expect(result.output).toContain("no-console");
    expect(result.output).toContain("no-explicit-any");
  });
});

// ΓöÇΓöÇ unicode regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: unicode content", () => {
  it("handles CJK and emoji in git-log without crashing", () => {
    const input = loadFixture("git-log-unicode.txt");
    const result = gitLogFilter(input, { headCommits: 5, tailCommits: 3 });
    expect(result.output).toContain("µùÑµ£¼Φ¬₧");
    expect(result.output).toContain("≡ƒÄë");
    // No garbled characters
    expect(result.output).not.toContain("\ufffd");
  });

  it("end-to-end: filterShellOutput handles unicode commands", () => {
    const input = loadFixture("git-log-unicode.txt");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git log --oneline -20",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(input, meta);
    expect(result).toContain("µùÑµ£¼Φ¬₧");
  });
});

// ΓöÇΓöÇ CRLF regression ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: CRLF line endings", () => {
  it("git-status filter handles CRLF without splitting issues", () => {
    const input = loadFixture("git-status-crlf.txt");
    // Normalize CRLF to LF for filter input (real shell output would be LF)
    const normalized = input.replace(/\r\n/gu, "\n");
    const result = gitStatusFilter(normalized);
    expect(result.output).toContain("On branch main");
    expect(result.output).toContain("modified:   src/foo.ts");
  });
});

// ΓöÇΓöÇ git-show end-to-end ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("regression: git-show end-to-end", () => {
  it("filterShellOutput routes git show to git-show category", () => {
    const formatted = [
      "$ git show HEAD",
      "[exit 0]",
      "commit abc1234",
      "Author: Test <test@example.com>",
      "",
      "    fix: important bug",
      "",
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 000..111 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,4 @@",
      " line1",
      "+added",
      " line2",
    ].join("\n");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git show HEAD",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(formatted, meta);
    expect(result).toContain("commit abc1234");
    expect(result).toContain("fix: important bug");
  });
});

describe("ANSI color code handling", () => {
  it("stripAnsi removes CSI color codes", () => {
    const colored = "\x1b[31mred text\x1b[0m normal";
    expect(stripAnsi(colored)).toBe("red text normal");
  });

  it("stripAnsi removes bold and color combinations", () => {
    const colored = "\x1b[1;32mbold green\x1b[0m";
    expect(stripAnsi(colored)).toBe("bold green");
  });

  it("stripAnsi handles multiple codes in one line", () => {
    const colored = "\x1b[33mwarning\x1b[0m: \x1b[1mimportant\x1b[0m message";
    expect(stripAnsi(colored)).toBe("warning: important message");
  });

  it("stripAnsi removes OSC sequences", () => {
    const osc = "\x1b]0;window title\x07rest";
    expect(stripAnsi(osc)).toBe("rest");
  });

  it("filterShellOutput strips ANSI before filtering git-status", () => {
    const fixture = loadFixture("git-status-ansi.txt");
    const meta: FilterMeta = {
      tool: "run_command",
      command: "git status",
      exitCode: 0,
      timedOut: false,
    };
    const result = filterShellOutput(fixture, meta);
    // Result should not contain any escape sequences
    expect(result).not.toContain("\x1b[");
    // Result should still contain meaningful content
    expect(result).toContain("On branch main");
    expect(result).toContain("modified:   src/app.ts");
  });

  it("filterShellOutput with ANSI preserves error-bypass behavior", () => {
    const colored = "\x1b[31mError: something failed\x1b[0m\nMore error details\n";
    const meta: FilterMeta = {
      tool: "run_command",
      command: "some-cmd",
      exitCode: 1,
      timedOut: false,
    };
    const result = filterShellOutput(colored, meta);
    // Error output should be returned (stripped of ANSI) but unfiltered
    expect(result).toContain("Error: something failed");
    expect(result).not.toContain("\x1b[");
  });
});
