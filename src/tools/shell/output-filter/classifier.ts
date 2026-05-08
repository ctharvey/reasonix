/** Command classification for output filtering. */

export type CommandCategory =
  | "git-status"
  | "git-diff"
  | "git-log"
  | "git-show"
  | "git-other"
  | "ls-tree"
  | "search"
  | "json"
  | "test"
  | "build"
  | "lint"
  | "typecheck"
  | "generic";

export interface ClassifiedCommand {
  category: CommandCategory;
  /** The base command (first token after runner stripping). */
  base: string;
  /** Full original command string. */
  command: string;
}

const RUNNER_RE = /^(npx|pnpm|yarn\s+run|yarn|npm\s+run|npm|bun|deno)\s+/;

/** Classify a shell command string into a filter category. */
export function classifyCommand(command: string): ClassifiedCommand {
  const trimmed = command.trim();
  const firstToken = trimmed.split(/\s+/)[0] ?? "";

  // Check runner-prefixed patterns FIRST ΓÇö before stripping the prefix.
  // "npm test", "pnpm test", "yarn test" ΓåÆ test
  // "npm run build", "pnpm run build", "yarn run build" ΓåÆ build
  const runnerCat = classifyRunnerPrefix(trimmed);
  if (runnerCat !== null) {
    const stripped = trimmed.replace(RUNNER_RE, "");
    const base = stripped.split(/\s+/)[0] ?? firstToken;
    return { category: runnerCat, base, command };
  }

  // Strip runner prefix for direct tool names: "npx vitest" ΓåÆ base "vitest"
  const stripped = trimmed.replace(RUNNER_RE, "");
  const base = stripped === trimmed ? firstToken : (stripped.split(/\s+/)[0] ?? firstToken);

  if (base === "git") return classifyGit(command);
  if (base === "ls" || base === "dir" || base === "tree" || base === "find") {
    return { category: "ls-tree", base, command };
  }
  if (base === "grep" || base === "rg" || base === "findstr" || base === "ag" || base === "ack") {
    return { category: "search", base, command };
  }
  if (isJsonCommand(base, command)) return { category: "json", base, command };
  if (isTestCommand(base, command)) return { category: "test", base, command };
  if (isBuildCommand(base, command)) return { category: "build", base, command };
  if (isLintCommand(base, command)) return { category: "lint", base, command };
  if (isTypecheckCommand(base, command)) return { category: "typecheck", base, command };

  return { category: "generic", base, command };
}

/** Match runner-prefix patterns that don't delegate to a known bin name. */
function classifyRunnerPrefix(command: string): CommandCategory | null {
  // "npm test", "pnpm test", "yarn test" (no sub-bin, just the runner verb)
  if (/^(npm|pnpm|yarn|bun|deno)\s+test\b/.test(command)) return "test";
  // "npm run build", "pnpm run build", "yarn run build"
  if (/^(npm|pnpm|yarn|bun|deno)\s+run\s+build\b/.test(command)) return "build";
  // "npm run lint", "pnpm run lint", etc.
  if (/^(npm|pnpm|yarn|bun|deno)\s+run\s+lint\b/.test(command)) return "lint";
  // "npm run typecheck", "npm run type-check", etc.
  if (/^(npm|pnpm|yarn|bun|deno)\s+run\s+type[-]?check\b/.test(command)) return "typecheck";
  // "npm ls --json", "pnpm ls --json", etc.
  if (/^(npm|pnpm|yarn|bun|deno)\s+ls\b.*--json/.test(command)) return "json";
  return null;
}

function classifyGit(command: string): ClassifiedCommand {
  const base = "git";
  const tokens = command.trim().split(/\s+/);
  const sub = tokens[1] ?? "";
  if (sub === "status") return { category: "git-status", base, command };
  if (sub === "diff") return { category: "git-diff", base, command };
  if (sub === "log") return { category: "git-log", base, command };
  if (sub === "show") return { category: "git-show", base, command };
  return { category: "git-other", base, command };
}

const TEST_BINS = new Set([
  "vitest",
  "jest",
  "mocha",
  "ava",
  "tape",
  "tap",
  "pytest",
  "py.test",
  "unittest",
  "cargo",
  "go",
  "mvn",
  "gradle",
  "dotnet",
  "ruby",
  "rspec",
  "cucumber",
]);

function isJsonCommand(base: string, command: string): boolean {
  // Commands that typically produce JSON output.
  if (base === "jq" || base === "yq" || base === "json_pp" || base === "python3") {
    if (base === "python3") return command.includes("-m json.tool");
    return true;
  }
  // aws, gcloud, az with --output json
  if (base === "aws" || base === "gcloud" || base === "az") {
    return command.includes("--output json") || command.includes("--format json");
  }
  // curl piped to jq or with -s + JSON content-type
  if (base === "curl" && command.includes("jq")) return true;
  // npm ls --json, pnpm ls --json
  if ((base === "npm" || base === "pnpm" || base === "yarn") && command.includes("--json"))
    return true;
  return false;
}

function isTestCommand(base: string, command: string): boolean {
  if (TEST_BINS.has(base)) {
    if (base === "cargo") return command.includes(" test");
    if (base === "go") return command.includes(" test");
    if (base === "mvn" || base === "gradle") return command.includes("test");
    if (base === "dotnet") return command.includes("test");
    return true;
  }
  return false;
}

const BUILD_BINS = new Set([
  "cargo",
  "go",
  "mvn",
  "gradle",
  "make",
  "cmake",
  "dotnet",
  "msbuild",
  "xcodebuild",
  "bazel",
  "ninja",
  "build",
]);

function isBuildCommand(base: string, command: string): boolean {
  if (BUILD_BINS.has(base)) {
    if (base === "cargo") return command.includes(" build") || command.includes(" check");
    if (base === "go") return command.includes(" build");
    if (base === "mvn" || base === "gradle")
      return command.includes("compile") || command.includes("build");
    return true;
  }
  return false;
}

const LINT_BINS = new Set([
  "eslint",
  "ruff",
  "mypy",
  "clippy",
  "pylint",
  "flake8",
  "rubocop",
  "shellcheck",
  "hadolint",
]);

function isLintCommand(base: string, command: string): boolean {
  if (LINT_BINS.has(base)) return true;
  if (base === "cargo" && command.includes(" clippy")) return true;
  return false;
}

const TYPECHECK_BINS = new Set(["tsc", "tsc-watch", "pyright", "mypy"]);

function isTypecheckCommand(base: string, command: string): boolean {
  if (TYPECHECK_BINS.has(base)) return true;
  if (base === "biome" && command.includes("check")) return true;
  return false;
}
