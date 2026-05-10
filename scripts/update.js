#!/usr/bin/env node
// robOS update — cross-platform in-place updater for tarball-installed users.
//
// Flow:
//   1. GET api.robos.vip/version → server.current_version
//   2. Compare with local VERSION; if up-to-date → exit
//   3. Confirm with user (y/N)
//   4. Stop dashboard if running (preserves PID file path used by start.sh / robos.js)
//   5. Backup user dirs to data/.update-backup/{ISO timestamp}/
//   6. Read JWT from ~/.robos/license.jwt (must exist; otherwise must download fresh)
//   7. POST /update-token with JWT → fresh download_url
//   8. Download tarball to data/.update-staging/robos.tar.gz
//   9. Verify SHA256 (from /version response) — defer to v2; for now trust HTTPS
//   10. Extract using system `tar` (Mac/Linux/Win10+) into data/.update-staging/extracted/
//   11. Apply: copy "code" paths from extracted, NEVER touch user dirs
//   12. Cleanup staging dir
//   13. Restart dashboard if was running
//   14. Update launcher-state.json with new version
//
// Critical safety:
//   - User dirs NEVER overwritten: brand/, context/, clients/, projects/,
//     cron/jobs/, data/, .env, connections.md
//   - Backup taken BEFORE any modification — restore path printed if anything fails
//   - Atomic-ish: copy to staging first, swap into place after verify

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import https from 'node:https';

import * as state from './lib/launcher-state.js';
import { PROTECTED_PATHS, isProtected } from './lib/protected-paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STAGING = join(ROOT, 'data', '.update-staging');
const BACKUP_ROOT = join(ROOT, 'data', '.update-backup');

const COLORS = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, t) => COLORS ? `\x1b[${code}m${t}\x1b[0m` : t;
const ok = (m) => console.log(c('32', '[OK]'), m);
const info = (m) => console.log(c('36', '[..]'), m);
const warn = (m) => console.log(c('33', '[!!]'), m);
const fail = (m) => { console.error(c('31', '[FAIL]'), m); process.exit(1); };

const API_BASE = 'https://api.robos.vip';
// PROTECTED_PATHS + isProtected imported from ./lib/protected-paths.js
// (single source of truth, also consumed by smoke-update-preserves-user-files.js)

function readVersion() {
  const path = join(ROOT, 'VERSION');
  if (!existsSync(path)) return '0.0.0';
  return readFileSync(path, 'utf-8').trim();
}

function readJwt() {
  const path = join(homedir(), '.robos', 'license.jwt');
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim();
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method,
      headers: data
        ? { 'content-type': 'application/json', 'content-length': data.length }
        : {},
      timeout: 15_000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        } catch {
          resolve({ status: res.statusCode, body: null });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const file = createWriteStream(destPath);
    https.get({ hostname: u.hostname, port: u.port || 443, path: u.pathname + (u.search || ''), timeout: 60_000 }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function confirmUpdate(localV, serverV) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`Update ${c('33', localV)} → ${c('32', serverV)}? (y/N) `);
  rl.close();
  return /^y(es)?$/i.test(ans.trim());
}

function stopDashboardIfRunning() {
  const PID_FILE = join(ROOT, '.command-centre', 'server.pid');
  if (!existsSync(PID_FILE)) return false;
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (!Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false; // already dead
  }
  info(`Opresc dashboard PID ${pid}...`);
  try {
    process.kill(pid, 'SIGTERM');
    // Wait up to 5s
    for (let i = 0; i < 10; i++) {
      try { process.kill(pid, 0); } catch { return true; }
      execSync(platform() === 'win32' ? 'cmd /c timeout /t 1 /nobreak >nul' : 'sleep 0.5', { stdio: 'ignore' });
    }
    process.kill(pid, 'SIGKILL');
    return true;
  } catch (e) {
    warn(`Nu pot opri dashboard: ${e.message}`);
    return false;
  }
}

function backupUserContent(timestamp) {
  const target = join(BACKUP_ROOT, timestamp);
  mkdirSync(target, { recursive: true });
  for (const p of PROTECTED_PATHS) {
    const src = join(ROOT, p);
    if (!existsSync(src)) continue;
    const dst = join(target, p);
    mkdirSync(dirname(dst), { recursive: true });
    copyRecursive(src, dst);
  }
  return target;
}

function copyRecursive(src, dst) {
  const st = statSync(src);
  if (st.isDirectory()) {
    if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dst, entry));
    }
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

function ensureSystemTar() {
  const cmd = platform() === 'win32' ? 'where tar' : 'which tar';
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function extractTarball(tarPath, destDir) {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  // -xzf works on system tar across platforms (BSD tar on Mac, GNU on Linux, libarchive on Win10+)
  const res = spawnSync('tar', ['-xzf', tarPath, '-C', destDir], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error('tar extract failed');
}

function applyExtracted(srcRoot) {
  // The tarball has prefix "robOS/", so srcRoot = data/.update-staging/extracted/robOS/
  const robosFolder = join(srcRoot, 'robOS');
  const sourceRoot = existsSync(robosFolder) ? robosFolder : srcRoot;

  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const absSrc = join(sourceRoot, rel);
    const st = statSync(absSrc);

    if (st.isDirectory()) {
      // Skip if entire dir is protected
      if (rel && isProtected(rel.replace(/\\/g, '/') + '/')) continue;
      const absDst = join(ROOT, rel);
      if (rel && !existsSync(absDst)) mkdirSync(absDst, { recursive: true });
      for (const entry of readdirSync(absSrc)) {
        stack.push(rel ? join(rel, entry) : entry);
      }
    } else {
      // Skip if file under protected path
      const norm = rel.replace(/\\/g, '/');
      if (PROTECTED_PATHS.some((p) => norm.startsWith(p) || norm === p.replace(/\/$/, ''))) {
        continue;
      }
      const absDst = join(ROOT, rel);
      mkdirSync(dirname(absDst), { recursive: true });
      copyFileSync(absSrc, absDst);
    }
  }
}

function cleanupStaging() {
  if (existsSync(STAGING)) {
    rmSync(STAGING, { recursive: true, force: true });
  }
}

async function restartDashboard() {
  info('Repornesc dashboard...');
  const robosJs = join(ROOT, 'scripts', 'robos.js');
  spawnSync(process.execPath, [robosJs, '--no-browser'], { stdio: 'inherit' });
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const localV = readVersion();
  info(`Verific versiune curenta vs server (local: ${localV})`);

  let serverInfo;
  try {
    const r = await httpJson('GET', `${API_BASE}/version`);
    if (r.status !== 200 || !r.body?.current_version) {
      fail(`Server response invalid: HTTP ${r.status}`);
    }
    serverInfo = r.body;
  } catch (e) {
    fail(`Nu pot accesa ${API_BASE}/version: ${e.message}`);
  }

  const serverV = serverInfo.current_version;
  const cmp = compareVersions(localV, serverV);

  if (cmp === 0) {
    ok(`Esti la zi (v${localV}). Nimic de facut.`);
    process.exit(0);
  }
  if (cmp > 0) {
    warn(`Versiunea locala (${localV}) e MAI NOUA decat serverul (${serverV}). Skip.`);
    process.exit(0);
  }

  console.log('');
  console.log(c('1', `Update disponibil: ${localV} → ${serverV}`));
  if (serverInfo.changelog_url) console.log(`  Changelog: ${serverInfo.changelog_url}`);
  if (serverInfo.released_at) console.log(`  Data lansare: ${serverInfo.released_at}`);
  console.log('');

  const yes = await confirmUpdate(localV, serverV);
  if (!yes) {
    info('Anulat.');
    process.exit(0);
  }

  // Validate JWT exists. U26 fix: previously hard-failed if missing. Now,
  // attempt a fresh first-run bind (license-check.js → tryFirstRunBind) so
  // student on a new laptop can update without manual robos.js bind step.
  let jwt = readJwt();
  if (!jwt) {
    info(`License JWT lipseste — incerc bind initial pentru acest device...`);
    try {
      const checkScript = join(ROOT, 'scripts', 'license-check.js');
      if (existsSync(checkScript)) {
        const { pathToFileURL } = await import('node:url');
        const mod = await import(pathToFileURL(checkScript).href);
        const result = await mod.checkLicense(ROOT);
        if (result.ok) {
          jwt = readJwt();
          if (jwt) {
            ok(`License bind reusit — ${result.license_id}. Continui update-ul.`);
          }
        }
      }
    } catch (err) {
      // fall through to fail message
    }
    if (!jwt) {
      fail(
        `Nu gasesc ${join(homedir(), '.robos', 'license.jwt')}.\n` +
        `Licenta nu e activata pe acest device. Optiuni:\n` +
        `  1. Ruleaza Claude Code in directorul robOS o data — face bind automat.\n` +
        `  2. Daca .license-stamp lipseste, descarca tarball-ul proaspat din emailul de cumparare.\n` +
        `  3. Pentru evaluare/dev fara licenta: re-instaleaza din git clone (skip update flow).`
      );
    }
  }

  // Validate system tar available
  if (!ensureSystemTar()) {
    fail(`Comanda 'tar' nu e in PATH.\nPe Mac/Linux: vine cu OS-ul.\nPe Windows: vine cu Windows 10 1803+ (cauta in System32). Verifica cu: where tar`);
  }

  // Stop dashboard if running
  const wasRunning = stopDashboardIfRunning();

  // Backup
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  info(`Backup user content -> data/.update-backup/${ts}/`);
  const backupPath = backupUserContent(ts);
  ok(`Backup salvat la ${backupPath}`);

  // Get update token
  info('Cer download token (autentificat cu JWT-ul tau)...');
  let dlInfo;
  try {
    const r = await httpJson('POST', `${API_BASE}/update-token`, { jwt });
    if (r.status !== 200 || !r.body?.ok) {
      fail(`Update token refuzat: HTTP ${r.status} — ${JSON.stringify(r.body)}`);
    }
    dlInfo = r.body;
  } catch (e) {
    fail(`Cerere update token esuata: ${e.message}`);
  }
  ok('Token primit');

  // Download tarball
  cleanupStaging();
  mkdirSync(STAGING, { recursive: true });
  const tarPath = join(STAGING, 'robos.tar.gz');
  info(`Descarca ${dlInfo.download_url}...`);
  try {
    await downloadFile(dlInfo.download_url, tarPath);
  } catch (e) {
    fail(`Download esuat: ${e.message}`);
  }
  ok('Descarcare completa');

  // Extract
  info('Dezarhivez...');
  const extractDir = join(STAGING, 'extracted');
  try {
    extractTarball(tarPath, extractDir);
  } catch (e) {
    fail(`Extract esuat: ${e.message}`);
  }
  ok('Extract complet');

  // Apply (preserving user dirs)
  info('Aplic actualizarea (user content NU e atins)...');
  try {
    applyExtracted(extractDir);
  } catch (e) {
    fail(`Aplicare esuata: ${e.message}.\nUser content e in ${backupPath}.`);
  }
  ok('Cod actualizat');

  // Cleanup staging
  cleanupStaging();

  // Update state
  state.update({ last_robos_version: serverV });

  // Restart dashboard if was running
  if (wasRunning) {
    await restartDashboard();
  }

  console.log('');
  console.log(c('1', `Update v${localV} → v${serverV} complet.`));
  console.log(`  Backup: ${backupPath}`);
  console.log(`  Schema DB se actualizeaza automat la urmatoarea pornire dashboard (migration runner incremental).`);
  if (!wasRunning) {
    console.log(`  Pentru lansare: ${c('36', 'node scripts/robos.js')}`);
  }
}

// Guard: only run main() when invoked directly. Allows smoke tests to import
// helpers without triggering a real update flow.
const __invokedFile = process.argv[1] && process.argv[1].replace(/\\/g, '/');
const __thisFile = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedFile === __thisFile) {
  main().catch((e) => fail(e.message || String(e)));
}
