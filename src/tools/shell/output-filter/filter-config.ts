/** Shell output filter configuration ΓÇö env-var driven, no config.json schema change. */

/** True when shell output filtering is enabled. Env var REASONIX_OUTPUT_FILTERS=off overrides. */
export function shellOutputFiltersEnabled(): boolean {
  const env = process.env.REASONIX_OUTPUT_FILTERS;
  if (env === "off" || env === "false" || env === "0") return false;
  return true;
}

/** Read a numeric env var, returning the default if missing or invalid.
 * Clamps to [0, max] when max is provided ΓÇö prevents absurd values
 * that would effectively disable filtering or cause OOM. */
function envInt(name: string, fallback: number, max?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

/** Per-category head/tail line counts, configurable via env vars. */
export interface FilterLineConfig {
  genericHead: number;
  genericTail: number;
  testHead: number;
  testTail: number;
  buildHead: number;
  buildTail: number;
  lintHead: number;
  lintTail: number;
  typecheckHead: number;
  typecheckTail: number;
  gitDiffFileHead: number;
  gitDiffTail: number;
  gitLogHead: number;
  gitLogTail: number;
  gitStatusHead: number;
  gitStatusTail: number;
  logHead: number;
  logTail: number;
  logMaxConsecutiveDupes: number;
  fsMaxEntries: number;
  fsHeadLines: number;
  fsTailLines: number;
  searchMaxMatchesPerFile: number;
  searchMaxFiles: number;
  searchHeadLines: number;
  searchTailLines: number;
  jsonMaxKeysPerObject: number;
  jsonMaxArrayItems: number;
  jsonMaxDepth: number;
  jsonMaxValueLength: number;
}

const DEFAULT_FILTER_LINES: FilterLineConfig = {
  genericHead: 20,
  genericTail: 30,
  testHead: 10,
  testTail: 40,
  buildHead: 15,
  buildTail: 25,
  lintHead: 15,
  lintTail: 30,
  typecheckHead: 15,
  typecheckTail: 30,
  gitDiffFileHead: 15,
  gitDiffTail: 20,
  gitLogHead: 25,
  gitLogTail: 15,
  gitStatusHead: 50,
  gitStatusTail: 30,
  logHead: 15,
  logTail: 30,
  logMaxConsecutiveDupes: 3,
  fsMaxEntries: 50,
  fsHeadLines: 20,
  fsTailLines: 30,
  searchMaxMatchesPerFile: 5,
  searchMaxFiles: 15,
  searchHeadLines: 20,
  searchTailLines: 30,
  jsonMaxKeysPerObject: 10,
  jsonMaxArrayItems: 5,
  jsonMaxDepth: 3,
  jsonMaxValueLength: 80,
};

/** Multiplier applied to head/tail limits when the command includes verbose flags. */
const VERBOSE_MULTIPLIER = 2;

/** Per-knob upper bounds ΓÇö prevents env-var typos from disabling filtering or causing OOM. */
const MAX_LINE_LINES = 500;
const MAX_ENTRIES = 1000;
const MAX_DEPTH = 10;
const MAX_VALUE_LENGTH = 10_000;

/** Boost head/tail/entry limits when the user requested verbose output.
 *  Non-limit fields (jsonMaxDepth, jsonMaxValueLength) are left unchanged. */
export function boostForVerbose(lc: FilterLineConfig): FilterLineConfig {
  return {
    genericHead: lc.genericHead * VERBOSE_MULTIPLIER,
    genericTail: lc.genericTail * VERBOSE_MULTIPLIER,
    testHead: lc.testHead * VERBOSE_MULTIPLIER,
    testTail: lc.testTail * VERBOSE_MULTIPLIER,
    buildHead: lc.buildHead * VERBOSE_MULTIPLIER,
    buildTail: lc.buildTail * VERBOSE_MULTIPLIER,
    lintHead: lc.lintHead * VERBOSE_MULTIPLIER,
    lintTail: lc.lintTail * VERBOSE_MULTIPLIER,
    typecheckHead: lc.typecheckHead * VERBOSE_MULTIPLIER,
    typecheckTail: lc.typecheckTail * VERBOSE_MULTIPLIER,
    gitDiffFileHead: lc.gitDiffFileHead * VERBOSE_MULTIPLIER,
    gitDiffTail: lc.gitDiffTail * VERBOSE_MULTIPLIER,
    gitLogHead: lc.gitLogHead * VERBOSE_MULTIPLIER,
    gitLogTail: lc.gitLogTail * VERBOSE_MULTIPLIER,
    gitStatusHead: lc.gitStatusHead * VERBOSE_MULTIPLIER,
    gitStatusTail: lc.gitStatusTail * VERBOSE_MULTIPLIER,
    logHead: lc.logHead * VERBOSE_MULTIPLIER,
    logTail: lc.logTail * VERBOSE_MULTIPLIER,
    logMaxConsecutiveDupes: lc.logMaxConsecutiveDupes,
    fsMaxEntries: lc.fsMaxEntries * VERBOSE_MULTIPLIER,
    fsHeadLines: lc.fsHeadLines * VERBOSE_MULTIPLIER,
    fsTailLines: lc.fsTailLines * VERBOSE_MULTIPLIER,
    searchMaxMatchesPerFile: lc.searchMaxMatchesPerFile * VERBOSE_MULTIPLIER,
    searchMaxFiles: lc.searchMaxFiles * VERBOSE_MULTIPLIER,
    searchHeadLines: lc.searchHeadLines * VERBOSE_MULTIPLIER,
    searchTailLines: lc.searchTailLines * VERBOSE_MULTIPLIER,
    jsonMaxKeysPerObject: lc.jsonMaxKeysPerObject * VERBOSE_MULTIPLIER,
    jsonMaxArrayItems: lc.jsonMaxArrayItems * VERBOSE_MULTIPLIER,
    jsonMaxDepth: lc.jsonMaxDepth,
    jsonMaxValueLength: lc.jsonMaxValueLength,
  };
}

/** Load per-category filter line counts from env vars (REASONIX_FILTER_*). */
export function readFilterLineConfig(): FilterLineConfig {
  return {
    genericHead: envInt(
      "REASONIX_FILTER_GENERIC_HEAD",
      DEFAULT_FILTER_LINES.genericHead,
      MAX_LINE_LINES,
    ),
    genericTail: envInt(
      "REASONIX_FILTER_GENERIC_TAIL",
      DEFAULT_FILTER_LINES.genericTail,
      MAX_LINE_LINES,
    ),
    testHead: envInt("REASONIX_FILTER_TEST_HEAD", DEFAULT_FILTER_LINES.testHead, MAX_LINE_LINES),
    testTail: envInt("REASONIX_FILTER_TEST_TAIL", DEFAULT_FILTER_LINES.testTail, MAX_LINE_LINES),
    buildHead: envInt("REASONIX_FILTER_BUILD_HEAD", DEFAULT_FILTER_LINES.buildHead, MAX_LINE_LINES),
    buildTail: envInt("REASONIX_FILTER_BUILD_TAIL", DEFAULT_FILTER_LINES.buildTail, MAX_LINE_LINES),
    lintHead: envInt("REASONIX_FILTER_LINT_HEAD", DEFAULT_FILTER_LINES.lintHead, MAX_LINE_LINES),
    lintTail: envInt("REASONIX_FILTER_LINT_TAIL", DEFAULT_FILTER_LINES.lintTail, MAX_LINE_LINES),
    typecheckHead: envInt(
      "REASONIX_FILTER_TYPECHECK_HEAD",
      DEFAULT_FILTER_LINES.typecheckHead,
      MAX_LINE_LINES,
    ),
    typecheckTail: envInt(
      "REASONIX_FILTER_TYPECHECK_TAIL",
      DEFAULT_FILTER_LINES.typecheckTail,
      MAX_LINE_LINES,
    ),
    gitDiffFileHead: envInt(
      "REASONIX_FILTER_GIT_DIFF_FILE_HEAD",
      DEFAULT_FILTER_LINES.gitDiffFileHead,
      MAX_LINE_LINES,
    ),
    gitDiffTail: envInt(
      "REASONIX_FILTER_GIT_DIFF_TAIL",
      DEFAULT_FILTER_LINES.gitDiffTail,
      MAX_LINE_LINES,
    ),
    gitLogHead: envInt(
      "REASONIX_FILTER_GIT_LOG_HEAD",
      DEFAULT_FILTER_LINES.gitLogHead,
      MAX_LINE_LINES,
    ),
    gitLogTail: envInt(
      "REASONIX_FILTER_GIT_LOG_TAIL",
      DEFAULT_FILTER_LINES.gitLogTail,
      MAX_LINE_LINES,
    ),
    gitStatusHead: envInt(
      "REASONIX_FILTER_GIT_STATUS_HEAD",
      DEFAULT_FILTER_LINES.gitStatusHead,
      MAX_LINE_LINES,
    ),
    gitStatusTail: envInt(
      "REASONIX_FILTER_GIT_STATUS_TAIL",
      DEFAULT_FILTER_LINES.gitStatusTail,
      MAX_LINE_LINES,
    ),
    logHead: envInt("REASONIX_FILTER_LOG_HEAD", DEFAULT_FILTER_LINES.logHead, MAX_LINE_LINES),
    logTail: envInt("REASONIX_FILTER_LOG_TAIL", DEFAULT_FILTER_LINES.logTail, MAX_LINE_LINES),
    logMaxConsecutiveDupes: envInt(
      "REASONIX_FILTER_LOG_MAX_DUPE",
      DEFAULT_FILTER_LINES.logMaxConsecutiveDupes,
      MAX_LINE_LINES,
    ),
    fsMaxEntries: envInt(
      "REASONIX_FILTER_FS_MAX_ENTRIES",
      DEFAULT_FILTER_LINES.fsMaxEntries,
      MAX_ENTRIES,
    ),
    fsHeadLines: envInt(
      "REASONIX_FILTER_FS_HEAD",
      DEFAULT_FILTER_LINES.fsHeadLines,
      MAX_LINE_LINES,
    ),
    fsTailLines: envInt(
      "REASONIX_FILTER_FS_TAIL",
      DEFAULT_FILTER_LINES.fsTailLines,
      MAX_LINE_LINES,
    ),
    searchMaxMatchesPerFile: envInt(
      "REASONIX_FILTER_SEARCH_MAX_MATCHES",
      DEFAULT_FILTER_LINES.searchMaxMatchesPerFile,
      MAX_ENTRIES,
    ),
    searchMaxFiles: envInt(
      "REASONIX_FILTER_SEARCH_MAX_FILES",
      DEFAULT_FILTER_LINES.searchMaxFiles,
      MAX_ENTRIES,
    ),
    searchHeadLines: envInt(
      "REASONIX_FILTER_SEARCH_HEAD",
      DEFAULT_FILTER_LINES.searchHeadLines,
      MAX_LINE_LINES,
    ),
    searchTailLines: envInt(
      "REASONIX_FILTER_SEARCH_TAIL",
      DEFAULT_FILTER_LINES.searchTailLines,
      MAX_LINE_LINES,
    ),
    jsonMaxKeysPerObject: envInt(
      "REASONIX_FILTER_JSON_MAX_KEYS",
      DEFAULT_FILTER_LINES.jsonMaxKeysPerObject,
      MAX_ENTRIES,
    ),
    jsonMaxArrayItems: envInt(
      "REASONIX_FILTER_JSON_MAX_ARRAY",
      DEFAULT_FILTER_LINES.jsonMaxArrayItems,
      MAX_ENTRIES,
    ),
    jsonMaxDepth: envInt(
      "REASONIX_FILTER_JSON_MAX_DEPTH",
      DEFAULT_FILTER_LINES.jsonMaxDepth,
      MAX_DEPTH,
    ),
    jsonMaxValueLength: envInt(
      "REASONIX_FILTER_JSON_MAX_VALUE_LEN",
      DEFAULT_FILTER_LINES.jsonMaxValueLength,
      MAX_VALUE_LENGTH,
    ),
  };
}
