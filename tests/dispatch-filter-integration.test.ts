import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../src/tools.js";
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

describe("dispatch → resultFilter integration", () => {
  it("applies resultFilter to dispatch output before returning to caller", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    reg.register({
      name: "read_file",
      fn: () => {
        const lines: string[] = [];
        for (let i = 0; i < 50; i++) lines.push(`import { sym${i} } from 'mod${i}';`);
        lines.push("");
        for (let i = 0; i < 30; i++) lines.push(`const x${i} = ${i};`);
        return lines.join("\n");
      },
    });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("read_file", '{"path":"test.ts"}');
    // Import collapsing should have happened
    expect(result).toContain("[50 imports:");
    expect(result).not.toContain("import { sym0 }");
  });

  it("records telemetry via the dispatch filter path", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    reg.register({
      name: "read_file",
      fn: () => {
        const lines: string[] = [];
        for (let i = 0; i < 50; i++) lines.push(`import { sym${i} } from 'mod${i}';`);
        lines.push("");
        for (let i = 0; i < 30; i++) lines.push(`const x${i} = ${i};`);
        return lines.join("\n");
      },
    });
    reg.setResultFilter(filterToolResult);

    await reg.dispatch("read_file", '{"path":"test.ts"}');

    const summary = getFilterTelemetryStore().getSummary();
    expect(summary.totalCalls).toBeGreaterThanOrEqual(1);
    expect(summary.filteredCalls).toBeGreaterThanOrEqual(1);
  });

  it("stores raw output when dispatch filter truncates", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    const bigContent = [
      ...Array.from({ length: 50 }, (_, i) => `import { sym${i} } from 'mod${i}';`),
      "",
      ...Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`),
    ].join("\n");
    reg.register({ name: "read_file", fn: () => bigContent });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("read_file", '{"path":"test.ts"}');

    // Result should contain the raw_output_id marker
    expect(result).toMatch(/raw_output_id=\d+/);

    // Extract the ID and verify raw output is recoverable
    const idMatch = result.match(/raw_output_id=(\d+)/);
    expect(idMatch).not.toBeNull();
    const rawId = Number.parseInt(idMatch![1]!, 10);
    const { getRawOutputStore } = await import(
      "../src/tools/shell/output-filter/raw-output-store.js"
    );
    const store = getRawOutputStore();
    const recovered = store.get(rawId);
    expect(recovered).toBeDefined();
    expect(recovered!.raw).toBe(bigContent);
  });

  it("skips filter when REASONIX_OUTPUT_FILTERS=off", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "off");
    const reg = new ToolRegistry();
    const bigContent = [
      ...Array.from({ length: 50 }, (_, i) => `import { sym${i} } from 'mod${i}';`),
      "",
      ...Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`),
    ].join("\n");
    reg.register({ name: "read_file", fn: () => bigContent });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("read_file", '{"path":"test.ts"}');
    expect(result).toBe(bigContent);
  });

  it("skips small results (< 500 chars) through dispatch filter", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    reg.register({ name: "read_file", fn: () => "const x = 1;" });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("read_file", '{"path":"small.ts"}');
    expect(result).toBe("const x = 1;");
  });

  it("shell tools bypass dispatch filter (no double-compress)", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    const big = "x".repeat(2000);
    reg.register({ name: "run_command", fn: () => big });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("run_command", '{"command":"echo hi"}');
    expect(result).toBe(big);
  });

  it("raw_output tool bypasses dispatch filter", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    const big = "x".repeat(2000);
    reg.register({ name: "raw_output", fn: () => big });
    reg.setResultFilter(filterToolResult);

    const result = await reg.dispatch("raw_output", '{"id":1}');
    expect(result).toBe(big);
  });

  it("resultFilter is inert until setResultFilter is called", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    const bigContent = [
      ...Array.from({ length: 50 }, (_, i) => `import { sym${i} } from 'mod${i}';`),
      "",
      ...Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`),
    ].join("\n");
    reg.register({ name: "read_file", fn: () => bigContent });
    // NOT calling setResultFilter — filter is inert

    const result = await reg.dispatch("read_file", '{"path":"test.ts"}');
    expect(result).toBe(bigContent);
  });

  it("filter runs before maxResultChars truncation", async () => {
    vi.stubEnv("REASONIX_OUTPUT_FILTERS", "on");
    const reg = new ToolRegistry();
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) lines.push(`import { sym${i} } from 'mod${i}';`);
    lines.push("");
    for (let i = 0; i < 30; i++) lines.push(`const x${i} = ${i};`);
    reg.register({ name: "read_file", fn: () => lines.join("\n") });
    reg.setResultFilter(filterToolResult);

    // Even with a generous char limit, the filter should have compressed imports
    const result = await reg.dispatch("read_file", '{"path":"test.ts"}', {
      maxResultChars: 100_000,
    });
    expect(result).toContain("[50 imports:");
  });
});
