import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compressReadFile } from "../src/tools/output-filter/compress-read-file.js";

describe("compressReadFile — import collapsing", () => {
  it("collapses consecutive ES import lines with symbol preservation", () => {
    const input = [
      "import { useState, useEffect } from 'react';",
      "import { Button } from './components/Button';",
      "import type { Config } from './types';",
      "",
      "export function App() {",
      "  const [count, setCount] = useState(0);",
      "}",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("[3 imports:");
    // Symbol-preserving: module names AND symbols visible
    expect(result.output).toContain("react(useState, useEffect)");
    expect(result.output).toContain("type ./types(Config)");
    expect(result.output).toContain("App()");
  });

  it("preserves side-effect imports in collapsed form", () => {
    const input = [
      "import './polyfills';",
      "import { thing } from './mod';",
      "",
      "console.log(thing);",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.output).toContain("[2 imports:");
    expect(result.output).toContain("./polyfills(side-effect)");
  });

  it("preserves namespace imports", () => {
    const input = [
      "import * as fs from 'fs';",
      "import { readFileSync } from 'fs';",
      "",
      "const data = readFileSync('file.txt');",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.output).toContain("[2 imports:");
    expect(result.output).toContain("fs(* as fs)");
    expect(result.output).toContain("fs(readFileSync)");
  });

  it("preserves default imports", () => {
    const input = [
      "import React from 'react';",
      "import { useState } from 'react';",
      "",
      "function Comp() {}",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.output).toContain("[2 imports:");
    expect(result.output).toContain("react(React)");
    expect(result.output).toContain("react(useState)");
  });

  it("handles CJS require lines", () => {
    const input = [
      "const path = require('path');",
      "const fs = require('fs');",
      "",
      "module.exports = { path, fs };",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.output).toContain("[2 imports:");
    expect(result.output).toContain("path(path)");
    expect(result.output).toContain("fs(fs)");
  });

  it("does not collapse imports when importCollapse is false", () => {
    const input = [
      "import { useState } from 'react';",
      "import { Button } from './Button';",
      "",
      "export default App;",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    expect(result.output).toContain("import { useState } from 'react';");
    expect(result.output).toContain("import { Button } from './Button';");
  });

  it("separates import groups split by blank lines", () => {
    const input = [
      "import { useState } from 'react';",
      "import { Button } from './Button';",
      "",
      "import { Config } from './config';",
      "",
      "export default App;",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    // Two separate import groups collapsed separately
    const importLines = result.output.split("\n").filter((l) => l.startsWith("// ["));
    expect(importLines.length).toBe(2);
  });

  it("preserves aliased import symbols", () => {
    const input = ["import { useState as useSt } from 'react';", "", "const s = useSt(0);"].join(
      "\n",
    );

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 2,
      commentThreshold: 50,
    });
    // Should preserve the original symbol name (useState), not the alias
    expect(result.output).toContain("react(useState)");
  });
});

describe("compressReadFile — blank line compression", () => {
  it("collapses runs of 3+ blank lines to 1", () => {
    const input = "line1\n\n\n\nline2\n\n\n\n\nline3";
    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 1,
      commentThreshold: 50,
    });
    const lines = result.output.split("\n");
    const blankRuns: number[] = [];
    let run = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        run++;
      } else {
        if (run > 0) blankRuns.push(run);
        run = 0;
      }
    }
    for (const r of blankRuns) {
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("preserves single blank lines", () => {
    const input = "line1\n\nline2\n\nline3";
    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 1,
      commentThreshold: 50,
    });
    expect(result.output).toBe("line1\n\nline2\n\nline3");
  });

  it("strips trailing blank lines", () => {
    const input = "line1\nline2\n\n\n";
    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 1,
      commentThreshold: 50,
    });
    expect(result.output.endsWith("\n")).toBe(false);
  });
});

describe("compressReadFile — comment block compression", () => {
  it("collapses comment blocks >= threshold (10 lines)", () => {
    const commentLines = Array.from({ length: 15 }, (_, i) => `// comment line ${i + 1}`);
    const input = [...commentLines, "", "const x = 1;"].join("\n");

    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 2,
      commentThreshold: 10,
    });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("comment lines omitted");
    // First and last lines preserved
    expect(result.output).toContain("comment line 1");
    expect(result.output).toContain("comment line 15");
  });

  it("does NOT collapse comment blocks with JSDoc tags", () => {
    const input = [
      "/**",
      " * Complex function description.",
      " * @param name The name of the thing",
      " * @returns The processed result",
      " * @deprecated Use newFunc instead",
      " * More explanation here.",
      " * And even more.",
      " * And more still.",
      " * @example",
      " * newFunc('test')",
      " */",
      "function oldFunc(name: string): string {",
      "  return name;",
      "}",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 2,
      commentThreshold: 10,
    });
    // JSDoc tags block should NOT be collapsed
    expect(result.output).not.toContain("comment lines omitted");
    expect(result.output).toContain("@param");
    expect(result.output).toContain("@returns");
    expect(result.output).toContain("@deprecated");
  });

  it("preserves short comment blocks below threshold", () => {
    const input = ["// Short comment", "// Two lines only", "const x = 1;"].join("\n");

    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 2,
      commentThreshold: 10,
    });
    expect(result.output).not.toContain("comment lines omitted");
    expect(result.output).toContain("Short comment");
  });

  it("handles block-style /* */ comments", () => {
    const lines = ["/**"];
    for (let i = 0; i < 12; i++) lines.push(` * detail line ${i + 1}`);
    lines.push(" */");
    lines.push("const x = 1;");

    // Without JSDoc tags, this should be collapsible
    const input = lines.join("\n");
    const result = compressReadFile(input, {
      importCollapse: false,
      blankLineMax: 2,
      commentThreshold: 10,
    });
    expect(result.output).toContain("comment lines omitted");
  });
});

describe("compressReadFile — combined", () => {
  it("handles empty input", () => {
    const result = compressReadFile("");
    expect(result.output).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("handles input with no compressible content", () => {
    const input = "const x = 1;\nconst y = 2;\nconsole.log(x + y);";
    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 1,
      commentThreshold: 10,
    });
    expect(result.output).toBe(input);
    expect(result.truncated).toBe(false);
  });

  it("applies all compression phases to a realistic file", () => {
    const input = [
      "import { useState, useEffect, useCallback } from 'react';",
      "import type { FC } from 'react';",
      "import { Button, Input, Select } from './components';",
      "import { apiClient } from './api';",
      "import './styles.css';",
      "",
      "",
      "",
      "// Long comment block about this component",
      "// that explains the purpose and usage",
      "// of the component in detail for developers",
      "// who need to maintain it over time.",
      "// This comment block is quite verbose",
      "// and probably doesn't need all these lines",
      "// to be visible to the model for context.",
      "// But we keep it here for documentation.",
      "// Another line about edge cases.",
      "// And one more about the algorithm.",
      "// Plus a note about browser compat.",
      "// Finally, a security consideration.",
      "// Last line of the comment block.",
      "",
      "export const MyComponent: FC = () => {",
      "  const [value, setValue] = useState('');",
      "  return <Button onClick={() => setValue('')}>Reset</Button>;",
      "};",
    ].join("\n");

    const result = compressReadFile(input, {
      importCollapse: true,
      blankLineMax: 1,
      commentThreshold: 10,
    });
    expect(result.truncated).toBe(true);

    // Import collapse happened
    expect(result.output).not.toContain("import { useState");
    expect(result.output).toContain("[5 imports:");

    // Blank line compression happened (3 blanks → 1)
    const blankRuns: number[] = [];
    let run = 0;
    for (const line of result.output.split("\n")) {
      if (line.trim() === "") {
        run++;
      } else {
        if (run > 0) blankRuns.push(run);
        run = 0;
      }
    }
    for (const r of blankRuns) {
      expect(r).toBeLessThanOrEqual(1);
    }

    // Comment block compression happened
    expect(result.output).toContain("comment lines omitted");
  });
});
