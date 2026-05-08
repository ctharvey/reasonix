/** Command normalization ΓÇö adds safe structured-output flags before execution. */

import { tokenizeCommand } from "../parse.js";

export interface NormalizeResult {
  /** The command to actually execute (may have added flags). */
  executedCommand: string;
  /** The original command as typed by the user/caller. */
  displayCommand: string;
  /** True when the command was normalized (flags were added). */
  normalized: boolean;
  /** Human-readable description of what was added, for the result header. */
  description?: string;
}

/** True when command normalization is enabled. Env var REASONIX_NORMALIZATION=off overrides. */
export function normalizationEnabled(): boolean {
  const env = process.env.REASONIX_NORMALIZATION;
  if (env === "off" || env === "false" || env === "0") return false;
  return true;
}

/** Normalize a command string by adding safe structured-output flags.
 * When `raw` is true, skips normalization and returns the command as-is. */
export function normalizeCommand(command: string, opts?: { raw?: boolean }): NormalizeResult {
  if (opts?.raw) {
    return { executedCommand: command, displayCommand: command, normalized: false };
  }
  if (!normalizationEnabled()) {
    return { executedCommand: command, displayCommand: command, normalized: false };
  }

  const result = tryNormalize(command);
  if (result !== null) return result;

  return { executedCommand: command, displayCommand: command, normalized: false };
}

interface Normalizer {
  /** Match the command prefix (e.g. "ruff check", "eslint"). */
  match: RegExp;
  /** Check if the command already has an incompatible format flag. */
  hasConflict: (tokens: string[]) => boolean;
  /** Build the normalized command by inserting flags after the base tokens. */
  build: (tokens: string[], command: string) => NormalizeResult;
}

const NORMALIZERS: ReadonlyArray<Normalizer> = [
  // ruff check ΓåÆ ruff check --output-format json
  {
    match: /^(?:npx\s+|pnpm\s+|yarn\s+|bun\s+|deno\s+)?ruff\s+check\b/,
    hasConflict: (t) => t.some((a) => a.startsWith("--output-format") || a.startsWith("-f")),
    build: (t) => ({
      executedCommand: `${t.join(" ")} --output-format json`,
      displayCommand: t.join(" "),
      normalized: true,
      description: "--output-format json",
    }),
  },
  // eslint . ΓåÆ eslint . -f json
  {
    match: /^(?:npx\s+|pnpm\s+|yarn\s+|bun\s+|deno\s+)?eslint\b/,
    hasConflict: (t) =>
      t.some((a) => a === "-f" || a.startsWith("--format") || a.startsWith("-f=")),
    build: (t) => ({
      executedCommand: `${t.join(" ")} -f json`,
      displayCommand: t.join(" "),
      normalized: true,
      description: "-f json",
    }),
  },
  // go test ./... ΓåÆ go test -json ./...
  {
    match: /^go\s+test\b/,
    hasConflict: (t) => t.some((a) => a === "-json"),
    build: (t) => {
      // Insert -json right after "go test"
      const idx = t.indexOf("test");
      if (idx === -1) {
        return { executedCommand: t.join(" "), displayCommand: t.join(" "), normalized: false };
      }
      const before = t.slice(0, idx + 1);
      const after = t.slice(idx + 1);
      const executed = [...before, "-json", ...after].join(" ");
      return {
        executedCommand: executed,
        displayCommand: t.join(" "),
        normalized: true,
        description: "-json",
      };
    },
  },
  // tsc --noEmit ΓåÆ tsc --noEmit --pretty false
  {
    match: /^(?:npx\s+|pnpm\s+|yarn\s+|bun\s+|deno\s+)?tsc\b/,
    hasConflict: (t) => t.some((a) => a.startsWith("--pretty")),
    build: (t) => {
      // Don't add --pretty false if there's no --noEmit or similar read-only signal.
      // tsc without --noEmit is a write operation (it emits .js files).
      const hasNoEmit = t.some((a) => a === "--noEmit");
      if (!hasNoEmit) {
        return { executedCommand: t.join(" "), displayCommand: t.join(" "), normalized: false };
      }
      return {
        executedCommand: `${t.join(" ")} --pretty false`,
        displayCommand: t.join(" "),
        normalized: true,
        description: "--pretty false",
      };
    },
  },
  // mypy ΓåÆ mypy --output json
  {
    match: /^(?:npx\s+|pnpm\s+|yarn\s+|bun\s+|deno\s+)?mypy\b/,
    hasConflict: (t) => t.some((a) => a.startsWith("--output") || a.startsWith("--format")),
    build: (t) => ({
      executedCommand: `${t.join(" ")} --output json`,
      displayCommand: t.join(" "),
      normalized: true,
      description: "--output json",
    }),
  },
];

function tryNormalize(command: string): NormalizeResult | null {
  for (const normalizer of NORMALIZERS) {
    if (!normalizer.match.test(command)) continue;

    // Use proper tokenizer that respects quotes, not naive split(/\s+/).
    // This avoids mis-splitting commands like: eslint "path with spaces"
    let tokens: string[];
    try {
      tokens = tokenizeCommand(command);
    } catch {
      // Malformed command (unclosed quote) ΓÇö don't normalize.
      return null;
    }
    if (normalizer.hasConflict(tokens)) continue;

    const result = normalizer.build(tokens, command);
    if (result.normalized) return result;
  }
  return null;
}
