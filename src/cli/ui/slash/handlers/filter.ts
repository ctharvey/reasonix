/** /filter slash handler — live RTK output filter savings visibility. */
import { t } from "@/i18n/index.js";
import {
  clearFilterRuntimeOverride,
  hasFilterRuntimeOverride,
  isFilterEnabled,
  setFilterRuntimeOverride,
} from "../../../../tools/shell/output-filter/filter-config.js";
import { getRawOutputStore } from "../../../../tools/shell/output-filter/raw-output-store.js";
import {
  type FilterTelemetrySummary,
  getFilterTelemetryStore,
} from "../../../../tools/shell/output-filter/telemetry.js";
import type { SlashHandler } from "../dispatch.js";
import { compactNum } from "../helpers.js";
import type { SlashResult } from "../types.js";

const filter: SlashHandler = (args) => {
  const sub = args[0]?.toLowerCase();

  // /filter on / /filter off — runtime toggle
  if (sub === "on") {
    setFilterRuntimeOverride(true);
    return { info: t("handlers.filter.enabled") };
  }
  if (sub === "off") {
    setFilterRuntimeOverride(false);
    return { info: t("handlers.filter.disabled") };
  }

  // /filter top — per-command breakdown
  if (sub === "top") {
    return renderTop();
  }

  // /filter raw <id> — recover raw output by ID
  if (sub === "raw") {
    return renderRaw(args[1]);
  }

  // /filter bare — session summary
  return renderSummary();
};

function renderSummary(): SlashResult {
  if (!isFilterEnabled()) {
    return { info: t("handlers.filter.statusOff") };
  }

  const s = getFilterTelemetryStore().getSummary();
  if (s.totalCalls === 0) {
    return { info: t("handlers.filter.statusNoData") };
  }

  const bar = renderTinyBar(s.averageSavingsPct, 12);
  return {
    info: t("handlers.filter.summary", {
      raw: compactChars(s.totalRawChars),
      filtered: compactChars(s.totalFilteredChars),
      saved: compactNum(s.estimatedSavedTokens),
      pct: s.averageSavingsPct,
      filteredCalls: s.filteredCalls,
      fallbacks: s.fallbackCalls,
      bar,
    }),
  };
}

function renderTop(): SlashResult {
  const entries = getFilterTelemetryStore().getEntries();
  if (entries.length === 0) {
    return { info: t("handlers.filter.topNoData") };
  }

  // Aggregate by source (tool name for dispatch-level, command for shell)
  const byCommand = new Map<string, { raw: number; filtered: number; count: number }>();
  for (const e of entries) {
    const key = e.tool ?? e.command;
    const existing = byCommand.get(key);
    if (existing) {
      existing.raw += e.rawChars;
      existing.filtered += e.filteredChars;
      existing.count++;
    } else {
      byCommand.set(e.command, {
        raw: e.rawChars,
        filtered: e.filteredChars,
        count: 1,
      });
    }
  }

  const sorted = [...byCommand.entries()]
    .map(([cmd, data]) => ({
      cmd,
      raw: data.raw,
      filtered: data.filtered,
      savingsPct: data.raw > 0 ? Math.round(((data.raw - data.filtered) / data.raw) * 100) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 5);

  const lines = sorted.map((r, i) => {
    const src = r.cmd.length > 22 ? `${r.cmd.slice(0, 21)}…` : r.cmd;
    return ` #${i + 1} ${src.padEnd(24)} ${compactChars(r.raw)} → ${compactChars(r.filtered)} (${r.savingsPct}%)`;
  });

  return {
    info: `${t("handlers.filter.topHeader")}\n${lines.join("\n")}`,
  };
}

function renderRaw(idStr: string | undefined): SlashResult {
  if (!idStr) {
    return { info: t("handlers.filter.rawNoId") };
  }
  const id = Number(idStr);
  if (!Number.isFinite(id) || id < 1) {
    return { info: t("handlers.filter.rawInvalidId", { id: idStr }) };
  }
  const entry = getRawOutputStore().get(id);
  if (!entry) {
    return { info: t("handlers.filter.rawNotFound", { id }) };
  }
  const rawLines = entry.raw.split("\n").length;
  const header = t("handlers.filter.rawHeader", {
    id: entry.id,
    command: entry.command,
    tool: entry.tool,
    rawLines,
    filteredChars: entry.filteredChars,
    rawChars: entry.raw.length,
  });
  // Cap displayed raw output to avoid flooding the TUI
  const maxDisplayChars = 16_000;
  const body =
    entry.raw.length > maxDisplayChars
      ? `${entry.raw.slice(0, maxDisplayChars)}\n[… ${(entry.raw.length - maxDisplayChars).toLocaleString()} more chars …]`
      : entry.raw;
  return { info: `${header}\n${body}` };
}

function compactChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function renderTinyBar(pct: number, width: number): string {
  const w = Math.max(4, width);
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((w * clamped) / 100);
  return `[${"█".repeat(filled)}${"░".repeat(w - filled)}]`;
}

/** Get the current filter savings for the StatusRow pill — cheap call. */
export function getFilterSummaryForStatus(): FilterTelemetrySummary | null {
  if (!isFilterEnabled()) return null;
  const s = getFilterTelemetryStore().getSummary();
  return s.totalCalls > 0 ? s : null;
}

export const handlers: Record<string, SlashHandler> = { filter };
