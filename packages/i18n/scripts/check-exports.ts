/**
 * Checks the `exports` field of the generated `package.json`.
 *
 * Run `pnpm build.npm` first. Optionally pass the path of a previously
 * generated `package.json` to check that all of its export subpaths still
 * resolve. Otherwise, the expected subpaths are derived from the generated
 * files.
 *
 * Every subpath is resolved with Node.js for `import` and `require` and with
 * TypeScript for the matching declaration files.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Read generated package.json file
const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);
const name: string = packageJson.name;
const languages: string[] = packageJson.files.filter(
  (file: string) => !file.startsWith('index.')
);

// Check that each language uses a single subpath pattern
assert.deepEqual(
  Object.keys(packageJson.exports).sort(),
  ['.', ...languages.flatMap((code) => [`./${code}`, `./${code}/*`])].sort(),
  'Expected only ".", "./<lang>" and "./<lang>/*" exports'
);

// Collect expected subpaths and their files without extension
const expected = new Map<string, string>([['.', 'index']]);
const baselinePath = process.argv[2];
if (baselinePath) {
  for (const subpath of Object.keys(
    JSON.parse(fs.readFileSync(baselinePath, 'utf8')).exports
  )) {
    if (subpath === '.') continue;
    const parts = subpath.split('/');
    expected.set(
      subpath,
      parts.length === 2 ? `${parts[1]}/index` : parts.slice(1).join('/')
    );
  }
} else {
  for (const code of languages) {
    for (const file of fs.readdirSync(path.join(root, code))) {
      if (file.endsWith('.mjs')) {
        const reference = file.slice(0, -'.mjs'.length);
        expected.set(
          reference === 'index' ? `./${code}` : `./${code}/${reference}`,
          `${code}/${reference}`
        );
      }
    }
  }
}

// Create resolvers for runtime files and declaration files
const require = createRequire(path.join(root, 'index.cjs'));
const compilerOptions: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};
const resolveTypes = (
  specifier: string,
  mode: ts.ResolutionMode
): string | undefined =>
  ts.resolveModuleName(
    specifier,
    path.join(root, mode === ts.ModuleKind.ESNext ? 'check.mts' : 'check.cts'),
    compilerOptions,
    ts.sys,
    undefined,
    undefined,
    mode
  ).resolvedModule?.resolvedFileName;

// Resolve every expected subpath
const failures: string[] = [];
for (const [subpath, file] of expected) {
  const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;
  const target = path.join(root, file);
  const checks: [string, () => string | undefined, string][] = [
    [
      'import',
      () => fileURLToPath(import.meta.resolve(specifier)),
      `${target}.mjs`,
    ],
    ['require', () => require.resolve(specifier), `${target}.cjs`],
    [
      'import types',
      () => resolveTypes(specifier, ts.ModuleKind.ESNext),
      `${target}.d.mts`,
    ],
    [
      'require types',
      () => resolveTypes(specifier, ts.ModuleKind.CommonJS),
      `${target}.d.cts`,
    ],
  ];
  for (const [kind, resolve, expectedFile] of checks) {
    try {
      const resolved = resolve();
      if (
        !resolved ||
        path.resolve(resolved) !== path.resolve(expectedFile) ||
        !fs.existsSync(resolved)
      ) {
        failures.push(`${kind} ${specifier}: ${resolved} !== ${expectedFile}`);
      }
    } catch (error) {
      failures.push(`${kind} ${specifier}: ${(error as Error).message}`);
    }
  }
}

// Report result
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `${expected.size} subpaths resolved for import, require and types ` +
    `(${Object.keys(packageJson.exports).length} export keys, ` +
    `${fs.statSync(path.join(root, 'package.json')).size} bytes package.json)`
);
