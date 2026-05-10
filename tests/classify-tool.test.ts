import { describe, expect, it } from "vitest";
import {
  classifyTool,
  isNeverFilterTool,
  isShellTool,
} from "../src/tools/output-filter/classify-tool.js";

describe("classifyTool", () => {
  it("classifies read_file", () => {
    expect(classifyTool("read_file")).toBe("read_file");
  });

  it("classifies edit_file", () => {
    expect(classifyTool("edit_file")).toBe("edit_file");
  });

  it("classifies search_content", () => {
    expect(classifyTool("search_content")).toBe("search_content");
  });

  it("classifies wait_for_job and list_jobs as job_log", () => {
    expect(classifyTool("wait_for_job")).toBe("job_log");
    expect(classifyTool("list_jobs")).toBe("job_log");
  });

  it("classifies memory tools", () => {
    expect(classifyTool("remember")).toBe("memory");
    expect(classifyTool("forget")).toBe("memory");
    expect(classifyTool("recall_memory")).toBe("memory");
  });

  it("classifies web tools", () => {
    expect(classifyTool("web_search")).toBe("web");
    expect(classifyTool("web_fetch")).toBe("web");
  });

  it("classifies plan tools", () => {
    expect(classifyTool("submit_plan")).toBe("plan");
    expect(classifyTool("mark_step_complete")).toBe("plan");
    expect(classifyTool("revise_plan")).toBe("plan");
  });

  it("classifies MCP tools by prefix", () => {
    expect(classifyTool("mcp__memory__recall_memories")).toBe("mcp");
    expect(classifyTool("mcp__delegate__delegate_task")).toBe("mcp");
    expect(classifyTool("mcp__vps__vps_deploy")).toBe("mcp");
  });

  it("classifies shell tools as shell (bypass)", () => {
    expect(classifyTool("run_command")).toBe("shell");
    expect(classifyTool("run_background")).toBe("shell");
    expect(classifyTool("job_output")).toBe("shell");
    expect(classifyTool("stop_job")).toBe("shell");
  });

  it("classifies raw_output as passthrough", () => {
    expect(classifyTool("raw_output")).toBe("passthrough");
  });

  it("classifies passthrough tools", () => {
    expect(classifyTool("list_directory")).toBe("passthrough");
    expect(classifyTool("directory_tree")).toBe("passthrough");
    expect(classifyTool("write_file")).toBe("passthrough");
    expect(classifyTool("create_directory")).toBe("passthrough");
    expect(classifyTool("move_file")).toBe("passthrough");
    expect(classifyTool("get_file_info")).toBe("passthrough");
    expect(classifyTool("search_files")).toBe("passthrough");
    expect(classifyTool("ask_choice")).toBe("passthrough");
    expect(classifyTool("run_skill")).toBe("passthrough");
  });

  it("defaults unknown tools to passthrough", () => {
    expect(classifyTool("unknown_tool")).toBe("passthrough");
    expect(classifyTool("customThing")).toBe("passthrough");
  });
});

describe("isShellTool", () => {
  it("returns true for shell tools", () => {
    expect(isShellTool("run_command")).toBe(true);
    expect(isShellTool("run_background")).toBe(true);
    expect(isShellTool("job_output")).toBe(true);
    expect(isShellTool("stop_job")).toBe(true);
  });

  it("returns false for non-shell tools", () => {
    expect(isShellTool("read_file")).toBe(false);
    expect(isShellTool("mcp__test__tool")).toBe(false);
  });
});

describe("isNeverFilterTool", () => {
  it("returns true for raw_output", () => {
    expect(isNeverFilterTool("raw_output")).toBe(true);
  });

  it("returns false for other tools", () => {
    expect(isNeverFilterTool("read_file")).toBe(false);
    expect(isNeverFilterTool("run_command")).toBe(false);
  });
});
