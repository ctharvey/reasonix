import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSlash } from "../src/cli/ui/slash.js";
import { DeepSeekClient } from "../src/client.js";
import { CacheFirstLoop } from "../src/loop.js";
import { ImmutablePrefix } from "../src/memory/runtime.js";
import {
  getRawOutputStore,
  resetRawOutputStore,
} from "../src/tools/shell/output-filter/raw-output-store.js";
import {
  getFilterTelemetryStore,
  resetFilterTelemetryStore,
} from "../src/tools/shell/output-filter/telemetry.js";

const originalEnv = process.env.REASONIX_OUTPUT_FILTERS;

function makeLoop() {
  const client = new DeepSeekClient({
    apiKey: "sk-test",
    fetch: vi.fn() as unknown as typeof fetch,
  });
  return new CacheFirstLoop({
    client,
    prefix: new ImmutablePrefix({ system: "s" }),
  });
}

describe("/filter handler", () => {
  afterEach(() => {
    resetFilterTelemetryStore();
    resetRawOutputStore();
    if (originalEnv === undefined) {
      // biome-ignore lint/performance/noDelete: avoid leaking "undefined" into env
      delete process.env.REASONIX_OUTPUT_FILTERS;
    } else {
      process.env.REASONIX_OUTPUT_FILTERS = originalEnv;
    }
  });

  it("/filter bare returns 'no data' when telemetry is empty", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "on";
    const r = handleSlash("filter", [], makeLoop());
    expect(r.info).toMatch(/no tool calls filtered yet|active/);
  });

  it("/filter bare returns summary with bar when telemetry has data", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "on";
    const store = getFilterTelemetryStore();
    store.record({
      tool: "run_command",
      command: "npm test",
      filterKind: "test",
      rawChars: 50_000,
      filteredChars: 5_000,
      estimatedRawTokens: 12_000,
      estimatedFilteredTokens: 1_200,
      savingsPct: 90,
      rawOutputId: null,
      fallbackUsed: false,
      tokenCountsAreEstimate: false,
      timestamp: Date.now(),
    });
    const r = handleSlash("filter", [], makeLoop());
    expect(r.info).toMatch(/50\.0k chars/);
    expect(r.info).toMatch(/5\.0k chars/);
    expect(r.info).toMatch(/saved/);
    expect(r.info).toContain("█");
  });

  it("/filter bare returns 'filter is OFF' when disabled", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "off";
    const r = handleSlash("filter", [], makeLoop());
    expect(r.info).toMatch(/OFF/i);
  });

  it("/filter on enables runtime override", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "off";
    const r = handleSlash("filter", ["on"], makeLoop());
    expect(r.info).toMatch(/ON/);
    // A subsequent bare call should still show "no data" (enabled, empty)
    const r2 = handleSlash("filter", [], makeLoop());
    expect(r2.info).toMatch(/active/);
  });

  it("/filter off disables runtime override", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "on";
    const r = handleSlash("filter", ["off"], makeLoop());
    expect(r.info).toMatch(/OFF/);
  });

  it("/filter top returns per-command breakdown", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "on";
    const store = getFilterTelemetryStore();
    store.record({
      tool: "run_command",
      command: "git diff",
      filterKind: "git-diff",
      rawChars: 30_000,
      filteredChars: 3_000,
      estimatedRawTokens: 7_500,
      estimatedFilteredTokens: 750,
      savingsPct: 90,
      rawOutputId: null,
      fallbackUsed: false,
      tokenCountsAreEstimate: false,
      timestamp: Date.now(),
    });
    const r = handleSlash("filter", ["top"], makeLoop());
    expect(r.info).toMatch(/top savings/);
    expect(r.info).toMatch(/git diff/);
  });

  it("/filter top returns 'no data' when telemetry is empty", () => {
    process.env.REASONIX_OUTPUT_FILTERS = "on";
    const r = handleSlash("filter", ["top"], makeLoop());
    expect(r.info).toMatch(/no filter data/);
  });

  describe("/filter raw <id>", () => {
    it("returns usage hint when no id is given", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const r = handleSlash("filter", ["raw"], makeLoop());
      expect(r.info).toMatch(/usage:.*\/filter raw/);
    });

    it("returns invalid-id message for non-numeric id", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const r = handleSlash("filter", ["raw", "abc"], makeLoop());
      expect(r.info).toMatch(/invalid/i);
    });

    it("returns invalid-id message for zero", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const r = handleSlash("filter", ["raw", "0"], makeLoop());
      expect(r.info).toMatch(/invalid/i);
    });

    it("returns not-found for valid but missing id", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const r = handleSlash("filter", ["raw", "42"], makeLoop());
      expect(r.info).toMatch(/not found/);
    });

    it("returns the raw output body for a stored id", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const rawStore = getRawOutputStore();
      const id = rawStore.store("line 1\nline 2\nline 3\n", {
        command: "npm test",
        tool: "run_command",
        filteredChars: 100,
      });
      const r = handleSlash("filter", ["raw", String(id)], makeLoop());
      expect(r.info).toContain("line 1");
      expect(r.info).toContain("line 3");
      expect(r.info).toMatch(/npm test/);
    });

    it("truncates very large raw output in the display", () => {
      process.env.REASONIX_OUTPUT_FILTERS = "on";
      const rawStore = getRawOutputStore();
      const huge = "x".repeat(20_000);
      const id = rawStore.store(huge, {
        command: "big command",
        tool: "run_command",
        filteredChars: 500,
      });
      const r = handleSlash("filter", ["raw", String(id)], makeLoop());
      // Should contain the header and truncated body
      expect(r.info).toMatch(/big command/);
      expect(r.info).toMatch(/more chars/);
    });
  });
});
