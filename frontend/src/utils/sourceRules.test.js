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

  test('guest files must never contain ".allergens" or "allergensConfirmed"', () => {
    const guestFiles = [
      path.join(SRC_DIR, 'pages', 'GuestTable.jsx'),
      path.join(SRC_DIR, 'pages', 'ScanLanding.jsx'),
      path.join(SRC_DIR, 'services', 'guestApi.js'),
      path.join(SRC_DIR, 'services', 'guestService.js'),
      path.join(SRC_DIR, 'hooks', 'useGuestTable.js'),
      path.join(SRC_DIR, 'utils', 'guestJoin.js'),
      path.join(SRC_DIR, 'utils', 'guestSession.js'),
      path.join(SRC_DIR, 'utils', 'guestAllergies.js'),
      path.join(SRC_DIR, 'utils', 'guestMenu.js'),
      ...(fs.existsSync(path.join(SRC_DIR, 'Components', 'Guest'))
        ? getAllSourceFiles(path.join(SRC_DIR, 'Components', 'Guest'))
        : []),
    ];

    for (const file of guestFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content.includes('.allergens'), `${file} must not contain .allergens`).toBe(false);
        expect(content.includes('allergensConfirmed'), `${file} must not contain allergensConfirmed`).toBe(false);
      }
    }
  });

  test('staff client (services/api.js) must not contain "GUEST_TOKEN"', () => {
    const apiPath = path.join(SRC_DIR, 'services', 'api.js');
    const content = fs.readFileSync(apiPath, 'utf8');
    expect(content.includes('GUEST_TOKEN')).toBe(false);
  });

  test('guest client (services/guestApi.js) must not contain "AUTH_TOKEN"', () => {
    const guestApiPath = path.join(SRC_DIR, 'services', 'guestApi.js');
    const content = fs.readFileSync(guestApiPath, 'utf8');
    expect(content.includes('AUTH_TOKEN')).toBe(false);
  });

  test('STORAGE_KEYS.GUEST_TOKEN is referenced only in constants.js, guestApi.js and guestService.js', () => {
    const allSource = getAllSourceFiles(SRC_DIR);
    const allowed = ['constants.js', 'guestApi.js', 'guestService.js'];
    for (const file of allSource) {
      const basename = path.basename(file);
      if (!allowed.includes(basename)) {
        const content = fs.readFileSync(file, 'utf8');
        expect(
          content.includes('GUEST_TOKEN'),
          `${file} must not reference GUEST_TOKEN`
        ).toBe(false);
      }
    }
  });

  test('pages and Components must never contain "sessionStorage"', () => {
    const files = [
      ...getAllSourceFiles(path.join(SRC_DIR, 'pages')),
      ...getAllSourceFiles(path.join(SRC_DIR, 'Components')),
    ];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(
        content.includes('sessionStorage'),
        `${file} must not contain sessionStorage`
      ).toBe(false);
    }
  });

  test('no file under pages, Components, hooks, or services contains "response?.data?.message", "response.data.message" or "MESSAGES?."', () => {
    const FORBIDDEN_PATTERNS = [
      'response?.data?.message',
      'response.data.message',
      'MESSAGES?.',
    ];

    const findForbidden = (text) => {
      if (typeof text !== 'string') return [];
      return FORBIDDEN_PATTERNS.filter((pattern) => text.includes(pattern));
    };

    // Self-check (ii): findForbidden reports all 3 for dirty text and none for clean text
    const sampleDirty =
      'const a = response?.data?.message; const b = response.data.message; const c = MESSAGES?.common;';
    expect(findForbidden(sampleDirty)).toEqual([
      'response?.data?.message',
      'response.data.message',
      'MESSAGES?.',
    ]);
    const sampleClean = 'const msg = MESSAGES.guest.loadMenuFailed;';
    expect(findForbidden(sampleClean)).toEqual([]);

    const targetDirs = [
      path.join(SRC_DIR, 'pages'),
      path.join(SRC_DIR, 'Components'),
      path.join(SRC_DIR, 'hooks'),
      path.join(SRC_DIR, 'services'),
    ];

    let filesToCheck = [];
    for (const dir of targetDirs) {
      if (fs.existsSync(dir)) {
        filesToCheck = filesToCheck.concat(getAllSourceFiles(dir));
      }
    }

    // Self-check (i): list of scanned files must include specific files by name
    const normalizedFiles = filesToCheck.map((p) => p.replace(/\\/g, '/'));
    expect(
      normalizedFiles.some((f) =>
        f.endsWith('Components/Guest/GuestMenuList.jsx')
      ),
      'Must include Components/Guest/GuestMenuList.jsx'
    ).toBe(true);
    expect(
      normalizedFiles.some((f) => f.endsWith('pages/GuestTable.jsx')),
      'Must include pages/GuestTable.jsx'
    ).toBe(true);
    expect(
      normalizedFiles.some((f) => f.endsWith('pages/ScanLanding.jsx')),
      'Must include pages/ScanLanding.jsx'
    ).toBe(true);
    expect(
      normalizedFiles.some((f) => f.endsWith('hooks/useGuestTable.js')),
      'Must include hooks/useGuestTable.js'
    ).toBe(true);

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      const found = findForbidden(content);
      expect(
        found,
        `File ${filePath} contains forbidden patterns: ${found.join(', ')}`
      ).toEqual([]);
    }
  });
});

