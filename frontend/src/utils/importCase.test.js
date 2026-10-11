import fs from "fs";
import path from "path";
import os from "os";
import { describe, test, expect } from "vitest";

const stripComments = (code) => {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
};

export const extractRelativeSpecifiers = (code) => {
  const cleanCode = stripComments(code);
  const specifiers = [];

  // 1. import ... from './x' and export ... from './x' at start of line (multi-line supported)
  const fromRegex = /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?\s+from\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = fromRegex.exec(cleanCode)) !== null) {
    specifiers.push(match[1]);
  }

  // 2. import './x' at start of line (side-effect import)
  const sideEffectRegex = /(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(cleanCode)) !== null) {
    specifiers.push(match[1]);
  }

  // 3. dynamic import('./x')
  const dynamicRegex = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(cleanCode)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
};

export const checkFileImports = (filePath, srcDir) => {
  const errors = [];
  const content = fs.readFileSync(filePath, "utf8");
  const specifiers = extractRelativeSpecifiers(content);

  for (const specifier of specifiers) {
    const fileDir = path.dirname(filePath);
    const resolved = path.resolve(fileDir, specifier);

    // Skip targets that fall outside src (e.g. backend imports in test files)
    const relToSrc = path.relative(srcDir, resolved);
    if (relToSrc.startsWith("..") || path.isAbsolute(relToSrc)) {
      continue;
    }

    // Candidate extensions
    const candidates = [
      resolved,
      `${resolved}.js`,
      `${resolved}.jsx`,
      `${resolved}.css`,
      path.join(resolved, "index.js"),
      path.join(resolved, "index.jsx"),
    ];

    const actualTarget = candidates.find((c) => {
      try {
        return fs.existsSync(c) && fs.statSync(c).isFile();
      } catch {
        return false;
      }
    });

    if (!actualTarget) {
      errors.push({
        file: filePath,
        specifier,
        error: "Target file does not exist",
      });
      continue;
    }

    // Verify every path segment below srcDir against exact directory listing names
    const relFromSrc = path.relative(srcDir, actualTarget);
    const segments = relFromSrc.split(path.sep);

    let currentDir = srcDir;
    for (const segment of segments) {
      const realEntries = fs.readdirSync(currentDir);
      if (!realEntries.includes(segment)) {
        errors.push({
          file: filePath,
          specifier,
          segment,
          available: realEntries,
          error: `Case mismatch: segment '${segment}' not found in ${currentDir}`,
        });
        break;
      }
      currentDir = path.join(currentDir, segment);
    }
  }

  return errors;
};

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

describe("importCase validator", () => {
  const srcDir = path.resolve(__dirname, "..");
  const thisFile = path.resolve(__filename);

  test("every relative import under src resolves with exact letter case", () => {
    const allFiles = getAllFiles(srcDir);
    const targetFiles = allFiles.filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".jsx")) &&
        path.resolve(f) !== thisFile
    );

    const allErrors = [];
    for (const file of targetFiles) {
      const errors = checkFileImports(file, srcDir);
      allErrors.push(...errors);
    }

    expect(allErrors).toEqual([]);
  });

  test("correctly flags wrong-case imports and ignores correct imports in test fixture", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maitred-import-case-test-"));
    const tempSrc = path.join(tempRoot, "src");

    try {
      fs.mkdirSync(path.join(tempSrc, "Components", "Common"), { recursive: true });

      // Create target component
      fs.writeFileSync(
        path.join(tempSrc, "Components", "Common", "Button.jsx"),
        "export const Button = () => null;"
      );

      // Valid import file
      const validPath = path.join(tempSrc, "valid.js");
      fs.writeFileSync(
        validPath,
        "import { Button } from './Components/Common/Button.jsx';\nexport default Button;"
      );

      // Wrong case single-line import file (lowercase 'components')
      const invalidPath = path.join(tempSrc, "invalid.js");
      fs.writeFileSync(
        invalidPath,
        "import { Button } from './components/Common/Button.jsx';"
      );

      // Wrong case multi-line import file (lowercase 'common')
      const invalidMultiPath = path.join(tempSrc, "invalidMulti.js");
      fs.writeFileSync(
        invalidMultiPath,
        "import {\n  Button\n} from './Components/common/Button.jsx';"
      );

      const validErrors = checkFileImports(validPath, tempSrc);
      expect(validErrors).toEqual([]);

      const invalidErrors = checkFileImports(invalidPath, tempSrc);
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0].segment).toBe("components");

      const invalidMultiErrors = checkFileImports(invalidMultiPath, tempSrc);
      expect(invalidMultiErrors).toHaveLength(1);
      expect(invalidMultiErrors[0].segment).toBe("common");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
