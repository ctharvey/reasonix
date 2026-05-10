/** Tool name → filter category classification for dispatch-level result filtering.
 * Shell tools route to "shell" (bypass); raw_output is never filtered. */

export type ToolFilterCategory =
  | "read_file"
  | "edit_file"
  | "search_content"
  | "job_log"
  | "memory"
  | "web"
  | "mcp"
  | "plan"
  | "shell"
  | "passthrough";

/** Shell tools already filtered by filterShellOutput() — skip to avoid double-compress. */
const SHELL_TOOLS = new Set(["run_command", "run_background", "job_output", "stop_job"]);

/** Recovery inspector — never filter. */
const NEVER_FILTER = new Set(["raw_output"]);

/** Direct map for built-in tools with clear routing. */
const TOOL_CATEGORY_MAP: Record<string, ToolFilterCategory> = {
  read_file: "read_file",
  edit_file: "edit_file",
  search_content: "search_content",
  write_file: "passthrough",
  list_directory: "passthrough",
  directory_tree: "passthrough",
  search_files: "passthrough",
  get_file_info: "passthrough",
  create_directory: "passthrough",
  move_file: "passthrough",
  wait_for_job: "job_log",
  list_jobs: "job_log",
  remember: "memory",
  forget: "memory",
  recall_memory: "memory",
  web_search: "web",
  web_fetch: "web",
  run_skill: "passthrough",
  submit_plan: "plan",
  mark_step_complete: "plan",
  revise_plan: "plan",
  ask_choice: "passthrough",
};

/** Classify a tool name into a filter category. */
export function classifyTool(toolName: string): ToolFilterCategory {
  if (NEVER_FILTER.has(toolName)) return "passthrough";
  if (SHELL_TOOLS.has(toolName)) return "shell";

  const mapped = TOOL_CATEGORY_MAP[toolName];
  if (mapped) return mapped;

  // MCP tools have prefix like "mcp__serverName__toolName"
  if (toolName.startsWith("mcp__")) return "mcp";

  return "passthrough";
}

/** Check if a tool is already filtered by the shell pipeline. */
export function isShellTool(toolName: string): boolean {
  return SHELL_TOOLS.has(toolName);
}

/** Check if a tool should never be filtered. */
export function isNeverFilterTool(toolName: string): boolean {
  return NEVER_FILTER.has(toolName);
}
