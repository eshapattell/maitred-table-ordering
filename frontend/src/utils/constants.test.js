import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import { APP_NAME, STORAGE_KEYS, EVENTS, ROLES } from "./constants.js";

const getAllFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

describe("constants and project naming / design rules", () => {
  const srcDir = path.resolve(__dirname, "..");
  const allSrcFiles = getAllFiles(srcDir);
  const codeFiles = allSrcFiles.filter(
    (f) =>
      (f.endsWith(".js") || f.endsWith(".jsx")) &&
      !f.endsWith(".test.js") &&
      !f.endsWith(".test.jsx")
  );

  test("STORAGE_KEYS.AUTH_TOKEN is 'maitred.authToken'", () => {
    expect(STORAGE_KEYS.AUTH_TOKEN).toBe("maitred.authToken");
  });

  test("APP_NAME is 'MaîtreD', EVENTS and ROLES are defined", () => {
    expect(APP_NAME).toBe("MaîtreD");
    expect(EVENTS.UNAUTHORISED).toBe("maitred:unauthorised");
    expect(ROLES.OWNER).toBe("owner");
    expect(ROLES.KITCHEN).toBe("kitchen");
  });

  test("frontend/index.html contains '<title>MaîtreD</title>'", () => {
    const indexPath = path.resolve(srcDir, "../index.html");
    const content = fs.readFileSync(indexPath, "utf8");
    expect(content).toContain("<title>MaîtreD</title>");
  });

  test("the character 'î' appears in no file under src other than utils/constants.js (test files excluded)", () => {
    const offendingFiles = [];
    for (const file of codeFiles) {
      const rel = path.relative(srcDir, file);
      if (rel === path.join("utils", "constants.js")) continue;
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("î")) {
        offendingFiles.push(rel);
      }
    }
    expect(offendingFiles).toEqual([]);
  });

  test("no .js or .jsx file under src (test files excluded) contains a colour literal (#hex, rgb(, hsl()", () => {
    const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
    const rgbRegex = /\brgba?\(/i;
    const hslRegex = /\bhsla?\(/i;

    const violations = [];
    for (const file of codeFiles) {
      const content = fs.readFileSync(file, "utf8");
      const rel = path.relative(srcDir, file);
      if (hexRegex.test(content) || rgbRegex.test(content) || hslRegex.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  test("every colour variable listed in step 2 is defined in index.css", () => {
    const cssPath = path.resolve(srcDir, "index.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    const requiredColorVars = [
      "--color-bg",
      "--color-surface",
      "--color-surface-raised",
      "--color-border",
      "--color-border-strong",
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-on-accent",
      "--color-danger",
      "--color-success",
    ];

    for (const varName of requiredColorVars) {
      expect(cssContent).toContain(varName);
    }
  });
});
