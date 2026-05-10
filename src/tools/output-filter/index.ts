/** Universal tool result filter — dispatch-level compression for all tool outputs. */

export { filterToolResult } from "./filter-tool-result.js";
export { classifyTool, isShellTool, isNeverFilterTool } from "./classify-tool.js";
export type { ToolFilterCategory } from "./classify-tool.js";
export { compressReadFile } from "./compress-read-file.js";
export type { ReadFileCompressOptions } from "./compress-read-file.js";
