#!/usr/bin/env node
/**
 * smoke-security.js — wraps lint-security.js so smoke-all picks it up.
 *
 * If lint-security.js exits 1 (BLOCK findings), this exits 1.
 * Output is forwarded so failures are actionable from a single smoke run.
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LINT_PATH = join(__dirname, 'lint-security.js');

const result = spawnSync(process.execPath, [LINT_PATH], {
  encoding: 'utf-8',
  shell: false,
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status === null ? 1 : result.status);
