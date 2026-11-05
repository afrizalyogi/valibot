/**
 * Checks that the generated CommonJS entry points can be loaded.
 *
 * Run `pnpm build.npm` first. Requires the root `index.cjs` file and checks
 * that it registered the schema message of every language.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import package_ from '../package.json';

const require = createRequire(import.meta.url);

// Require root CommonJS entry point
require('@valibot/i18n');

// Check that every language registered its schema message
// Note: Valibot is required, as its ESM build has a separate message store
const { getSchemaMessage } = require('valibot');
for (const code of package_.files.filter(
  (file) => !file.startsWith('index.')
)) {
  assert.equal(
    typeof getSchemaMessage(code),
    'function',
    `Missing schema message for "${code}"`
  );
}
