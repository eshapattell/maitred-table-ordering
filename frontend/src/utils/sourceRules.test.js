import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(SRC_DIR, '..');

const getAllSourceFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllSourceFiles(fullPath));
    } else if (
      (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.test.jsx')
    ) {
      files.push(fullPath);
    }
  }
  return files;
};

describe('sourceRules (rule 12 safety and architecture checks)', () => {
  test('no source file under src contains forbidden patterns', () => {
    const sourceFiles = getAllSourceFiles(SRC_DIR);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      'dangerously' + 'SetInnerHTML',
      'inner' + 'HTML',
      'local' + 'Storage',
      '<dia' + 'log',
      'eval' + '(',
      'new ' + 'Function',
    ];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(
          content.includes(pattern),
          `File ${filePath} contains forbidden pattern: ${pattern}`
        ).toBe(false);
      }
    }
  });

  test('no file under pages, Components, or services contains console calls', () => {
    const targetDirs = [
      path.join(SRC_DIR, 'pages'),
      path.join(SRC_DIR, 'Components'),
      path.join(SRC_DIR, 'services'),
    ];

    let filesToCheck = [];
    for (const dir of targetDirs) {
      if (fs.existsSync(dir)) {
        filesToCheck = filesToCheck.concat(getAllSourceFiles(dir));
      }
    }

    expect(filesToCheck.length).toBeGreaterThan(0);

    const consolePattern = 'console' + '.';
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(
        content.includes(consolePattern),
        `File ${filePath} contains forbidden console call`
      ).toBe(false);
    }
  });

  test('index.css contains required theme, print, and autofill rules', () => {
    const cssPath = path.join(SRC_DIR, 'index.css');
    const content = fs.readFileSync(cssPath, 'utf8');

    expect(content).toContain('@media print');
    expect(content).toContain('.qr-print');
    expect(content).toContain('color-scheme: dark');
    expect(content).toContain(':-webkit-autofill');
    expect(content).toContain('body:has(.qr-print) #root');
    expect(content).not.toContain('#root,\n  .no-print');
  });

  test('index.css contains colour literals only in :root', () => {
    const cssPath = path.join(SRC_DIR, 'index.css');
    const content = fs.readFileSync(cssPath, 'utf8');

    const withoutRoot = content.replace(/:root\s*\{[\s\S]*?\}/, '');
    const colourPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g;
    const matches = withoutRoot.match(colourPattern) || [];
    expect(matches).toEqual([]);
  });

  test('index.html contains favicon link and page title with escaped accent', () => {
    const htmlPath = path.join(ROOT_DIR, 'index.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    expect(content).toContain('rel="icon"');
    const expectedTitle = '<title>Ma\u00eetreD</title>';
    expect(content).toContain(expectedTitle);
  });
});
