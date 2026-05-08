/** Metadata about the shell tool call that produced a formatted result. */
export interface FilterMeta {
  /** Which shell tool produced this result. */
  tool: "run_command" | "run_background" | "job_output" | "stop_job" | "list_jobs";
  /** The raw command string (from tool args). */
  command: string;
  /** Parsed exit code from the formatted header, or null if not applicable. */
  exitCode: number | null;
  /** True when the formatted header indicates a timeout kill. */
  timedOut: boolean;
}

/** Verbose-flag patterns that signal the user wants more detail, not less.
 *  Uses (^|\s) prefix instead of \b because -- flags start with non-word
 *  characters, and \b fails between space and dash. */
const VERBOSE_FLAGS: readonly RegExp[] = [
  /(?:^|\s)--verbose\b/,
  /(?:^|\s)-verbose\b/,
  /(?:^|\s)-v{2,}\b/, // -vv, -vvv (multi-v, not single -v)
  /(?:^|\s)--debug\b/,
  /(?:^|\s)--full\b/,
  /(?:^|\s)--detailed\b/,
  /(?:^|\s)--show-all\b/,
  /(?:^|\s)--no-summary\b/,
];

/** Detect verbose/debug flags in a command string. When present, filters
 *  should use less aggressive compression (higher head/tail limits). */
export function isVerboseCommand(command: string): boolean {
  return VERBOSE_FLAGS.some((re) => re.test(command));
}

/** Extract exitCode and timedOut from a formatted result header. */
export function parseResultMeta(
  formatted: string,
  tool: FilterMeta["tool"],
): Pick<FilterMeta, "exitCode" | "timedOut"> {
  // Timeout marker appears in run_command output
  if (formatted.includes("[killed after timeout]")) {
    return { exitCode: null, timedOut: true };
  }

  // [exit N] ΓÇö run_command (standalone bracket)
  const exitMatch = formatted.match(/\[exit (\d+)\]/);
  if (exitMatch) {
    return { exitCode: Number.parseInt(exitMatch[1]!, 10), timedOut: false };
  }

  // "exited N" ΓÇö job_output: [job N ┬╖ exited N ┬╖ byteLength=ΓÇª]
  // "┬╖ exit N]" ΓÇö stop_job: [job N stopped ┬╖ exit N]
  const jobExitMatch = formatted.match(/(?:exited|exit) (\d+)/);
  if (jobExitMatch) {
    return { exitCode: Number.parseInt(jobExitMatch[1]!, 10), timedOut: false };
  }

  // run_background or list_jobs ΓÇö no exit code in header
  return { exitCode: null, timedOut: false };
}
