#!/usr/bin/env node
/**
 * Build robos-base-v{VERSION}.tar.gz pentru customer distribution.
 *
 * Strategie:
 *   1. `git archive --format=tar --prefix=robOS/ HEAD` → tar din TRACKED files
 *      (auto-respecta .gitignore — excludes data/, .env, brand/, context/memory/, etc.)
 *   2. STRIP last 1024 bytes (cele 2 blocuri zero de terminator tar)
 *      Asta permite Worker-ului sa concateneze stamp-ul .license-stamp la final.
 *   3. Gzip rezultatul
 *   4. Output: licensing/build/robos-base-v{VERSION}.tar.gz
 *
 * Apoi: wrangler r2 object put robos-tarballs/robos-base-v{V}.tar.gz --file=...
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BUILD_DIR = join(__dirname, '..', 'build');
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf-8').trim();

const RAW_TAR = join(BUILD_DIR, `robos-base-v${VERSION}.tar`);
const NOTERM_TAR = join(BUILD_DIR, `robos-base-v${VERSION}.noterm.tar`);
const GZ_OUT = join(BUILD_DIR, `robos-base-v${VERSION}.tar.gz`);

if (!existsSync(BUILD_DIR)) mkdirSync(BUILD_DIR, { recursive: true });

console.log(`Building robOS base tarball v${VERSION}...`);

// 1. git archive (only tracked files — .gitignore respected)
console.log(' → git archive');
execSync(`git archive --format=tar --prefix=robOS/ -o "${RAW_TAR}" HEAD`, {
  cwd: ROOT,
  stdio: 'inherit',
});

const rawSize = statSync(RAW_TAR).size;
console.log(`   raw tar: ${(rawSize / 1024).toFixed(1)} KB`);

// 2. Strip TOATE trailing zeros (terminator 1024 + padding pana la 10K-block boundary)
//    Git archive padded la 10240-byte boundary cu zerouri, peste cele 1024 de terminator.
//    Strategy: walk de la final, gaseste ultimul byte non-zero, round UP la 512-boundary.
console.log(' → strip terminator + trailing padding');
const tarBytes = readFileSync(RAW_TAR);
let lastNonZero = tarBytes.length - 1;
while (lastNonZero >= 0 && tarBytes[lastNonZero] === 0) lastNonZero--;
if (lastNonZero < 0) {
  console.error('Tar is all zeros — corrupt');
  process.exit(1);
}
const cutAt = Math.ceil((lastNonZero + 1) / 512) * 512;
const noTerm = tarBytes.subarray(0, cutAt);
writeFileSync(NOTERM_TAR, noTerm);
console.log(`   raw end at byte ${tarBytes.length}, last non-zero at ${lastNonZero}, cut at ${cutAt}`);
console.log(`   noterm tar: ${(noTerm.length / 1024).toFixed(1)} KB`);

// 3. Gzip
console.log(' → gzip');
const stream = Readable.from(noTerm);
const gz = createGzip({ level: 9 });
const out = (await import('node:fs')).createWriteStream(GZ_OUT);
await pipeline(stream, gz, out);

const gzSize = statSync(GZ_OUT).size;
console.log(`   gzip out: ${(gzSize / 1024).toFixed(1)} KB`);

console.log('');
console.log(`OK build complete: ${GZ_OUT}`);
console.log('');
console.log('Upload at R2:');
console.log(`  cd licensing && wrangler r2 object put robos-tarballs/robos-base-v${VERSION}.tar.gz --file=build/robos-base-v${VERSION}.tar.gz --remote`);
