#!/usr/bin/env node
// robOS launcher — single command daily driver.
//
// Usage:
//   node scripts/robos.js              # launch (setup-if-needed, start dashboard, open browser)
//   node scripts/robos.js --setup-only # run setup without starting dashboard
//   node scripts/robos.js --no-browser # don't open browser
//   node scripts/robos.js --clean      # rebuild centre/dist from scratch
//   node scripts/robos.js --stop       # stop running dashboard
//   node scripts/robos.js --status     # print status (alive/dead, pid, port)
//
// Compatibility with scripts/start.sh:
//   Both use the same PID file (.command-centre/server.pid) and read PORT from
//   the same .env. Running `bash scripts/start.sh` then `node scripts/robos.js`
//   detects the existing process and just opens browser — no duplicate spawn.

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

import * as state from './lib/launcher-state.js';
import { checkBootstrap } from './lib/bootstrap-check.js';
import { probe } from './lib/http-probe.js';
import { openBrowser } from './lib/open-browser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PID_DIR = join(ROOT, '.command-centre');
const PID_FILE = join(PID_DIR, 'server.pid');
const SERVER_LOG = join(PID_DIR, 'server.log');
const SERVER_JS = join(ROOT, 'centre', 'server.js');

const COLORS = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, t) => COLORS ? `\x1b[${code}m${t}\x1b[0m` : t;
const ok = (m) => console.log(c('32', '[OK]'), m);
const info = (m) => console.log(c('36', '[..]'), m);
const warn = (m) => console.log(c('33', '[!!]'), m);
const fail = (m) => { console.error(c('31', '[FAIL]'), m); process.exit(1); };

const args = new Set(process.argv.slice(2));
const FLAGS = {
  setupOnly: args.has('--setup-only'),
  noBrowser: args.has('--no-browser'),
  clean: args.has('--clean'),
  stop: args.has('--stop'),
  status: args.has('--status'),
  installShortcut: args.has('--install-shortcut'),
  uninstallShortcut: args.has('--uninstall-shortcut'),
};

// ----------------------------------------------------------------------------
// .env loader (minimal — just for PORT)
// ----------------------------------------------------------------------------
function loadDotenvPort() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*PORT\s*=\s*(.+?)\s*$/);
    if (m) {
      const v = m[1].replace(/^["']|["']$/g, '');
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function resolvePort() {
  // Precedence: CLI env > .env > 3001 (matches scripts/start.sh)
  if (process.env.PORT) {
    const n = parseInt(process.env.PORT, 10);
    if (Number.isFinite(n)) return n;
  }
  return loadDotenvPort() || 3001;
}

// ----------------------------------------------------------------------------
// PID file management — compatible with scripts/start.sh
// ----------------------------------------------------------------------------
function readPid() {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function clearStalePid() {
  try { unlinkSync(PID_FILE); } catch {}
}

// ----------------------------------------------------------------------------
// Setup-if-needed
// ----------------------------------------------------------------------------
function runSetup() {
  info('Setup robOS (prima rulare sau bootstrap incomplet)');
  try {
    execSync(`node "${join(__dirname, 'setup.js')}"`, { stdio: 'inherit' });
  } catch (e) {
    fail(`Setup esuat: ${e.message}`);
  }
  state.update({
    setup_complete: true,
    bootstrap_valid: true,
    first_run_at: state.read().first_run_at || new Date().toISOString(),
  });
}

function repairBootstrap(missing) {
  warn(`Bootstrap incomplet: ${missing.join(', ')} — repar silent`);
  runSetup();
}

// ----------------------------------------------------------------------------
// Stop / status
// ----------------------------------------------------------------------------
function commandStop() {
  const pid = readPid();
  if (!pid || !isProcessAlive(pid)) {
    info('Dashboard-ul nu ruleaza.');
    clearStalePid();
    process.exit(0);
  }
  info(`Opresc dashboard (PID ${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
    // Wait up to 5s for graceful shutdown
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && isProcessAlive(pid)) {
      execSync(platform() === 'win32' ? 'cmd /c timeout /t 1 /nobreak >nul' : 'sleep 1', { stdio: 'ignore' });
    }
    if (isProcessAlive(pid)) {
      warn('SIGTERM ignorat — fortat cu SIGKILL');
      process.kill(pid, 'SIGKILL');
    }
    clearStalePid();
    ok('Dashboard oprit');
  } catch (e) {
    fail(`Nu pot opri PID ${pid}: ${e.message}`);
  }
  process.exit(0);
}

async function commandStatus() {
  const pid = readPid();
  const port = resolvePort();
  const alive = isProcessAlive(pid);
  const responding = await probe(port);
  const s = state.read();

  console.log(c('1', 'robOS status'));
  console.log(`  Setup complete:       ${s.setup_complete ? c('32', 'da') : c('31', 'nu')}`);
  console.log(`  Bootstrap valid:      ${s.bootstrap_valid ? c('32', 'da') : c('31', 'nu')}`);
  console.log(`  Last version:         ${s.last_robos_version || c('90', '(nu inca)')}`);
  console.log(`  PID file:             ${pid ? `PID ${pid} ${alive ? c('32', '(viu)') : c('31', '(mort)')}` : c('90', 'lipseste')}`);
  console.log(`  Dashboard port ${port}:  ${responding.alive ? c('32', `raspunde (HTTP ${responding.status})`) : c('31', 'nu raspunde')}`);
  console.log(`  Shortcut PATH:        ${s.shortcut_installed ? c('32', 'instalat') : c('90', 'neinstalat')}`);
  console.log(`  Last launch:          ${s.last_launch_at || c('90', 'niciodata')}`);
  process.exit(0);
}

// ----------------------------------------------------------------------------
// Start dashboard (compatible cu start.sh — acelasi PID file, acelasi LOG)
// ----------------------------------------------------------------------------
async function startDashboardAsync(port) {
  if (!existsSync(SERVER_JS)) {
    fail(`centre/server.js lipseste — ruleaza setup mai intai`);
  }

  if (FLAGS.clean) {
    const dist = join(ROOT, 'centre', 'dist');
    if (existsSync(dist)) {
      info('Sterg centre/dist (--clean)...');
      try { execSync(platform() === 'win32' ? `rmdir /s /q "${dist}"` : `rm -rf "${dist}"`, { stdio: 'ignore' }); } catch {}
    }
  }

  const distIndex = join(ROOT, 'centre', 'dist', 'index.html');
  if (!existsSync(distIndex)) {
    info('Build dashboard (lipsa dist/)...');
    try {
      execSync('npx astro build', { cwd: join(ROOT, 'centre'), stdio: 'inherit' });
    } catch (e) {
      fail(`Build esuat: ${e.message}`);
    }
  }

  if (!existsSync(PID_DIR)) mkdirSync(PID_DIR, { recursive: true });

  info(`Pornesc dashboard pe port ${port}...`);
  const fs = await import('node:fs');

  // Open log file as fd and pass directly to child stdio. This way no pipe
  // stays open in parent → parent can exit cleanly after spawn + unref.
  const logFd = fs.openSync(SERVER_LOG, 'a');

  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  // Closing parent's fd is safe — child has its own dup'd handle.
  fs.closeSync(logFd);

  return child.pid;
}

async function waitForReady(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await probe(port, '127.0.0.1', 1000);
    if (r.alive) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function commandInstallShortcut() {
  const { install } = await import('./lib/shortcut.js');
  const r = install();
  for (const res of r.results) {
    if (res.action === 'appended') ok(`Adaugat shortcut in ${res.path}${res.label ? ` (${res.label})` : ''}`);
    else if (res.action === 'updated') ok(`Updated shortcut in ${res.path}${res.label ? ` (${res.label})` : ''}`);
    else if (res.action === 'error') warn(`Eroare la ${res.path}: ${res.error}`);
  }
  if (r.hint) info(r.hint);
  state.update({ shortcut_installed: r.ok });
  process.exit(r.ok ? 0 : 1);
}

async function commandUninstallShortcut() {
  const { uninstall } = await import('./lib/shortcut.js');
  const r = uninstall();
  for (const res of r.results) {
    if (res.action === 'removed') ok(`Sters shortcut din ${res.path}${res.label ? ` (${res.label})` : ''}`);
    else if (res.action === 'noop') info(`Nimic de sters in ${res.path}`);
    else if (res.action === 'error') warn(`Eroare la ${res.path}: ${res.error}`);
  }
  state.update({ shortcut_installed: false });
  process.exit(r.ok ? 0 : 1);
}

async function main() {
  if (FLAGS.installShortcut) await commandInstallShortcut();
  if (FLAGS.uninstallShortcut) await commandUninstallShortcut();
  if (FLAGS.stop) commandStop();
  if (FLAGS.status) await commandStatus();

  const port = resolvePort();
  const url = `http://localhost:${port}`;

  // Setup-if-needed.
  // First-launch detection: if state says setup_complete=false BUT bootstrap is
  // already valid (user upgraded from a pre-launcher install), trust the disk
  // and just initialize state — don't re-run setup pointlessly.
  let s = state.read();
  if (!s.setup_complete) {
    const bs = checkBootstrap();
    if (bs.valid) {
      info('Detectat install existent fara state file — initializez state.');
      state.update({
        setup_complete: true,
        bootstrap_valid: true,
        first_run_at: s.first_run_at || new Date().toISOString(),
      });
      s = state.read();
    } else {
      runSetup();
      s = state.read();
    }
  } else {
    const bs = checkBootstrap();
    if (!bs.valid) {
      repairBootstrap(bs.missing);
      s = state.read();
    }
  }

  if (FLAGS.setupOnly) {
    ok('Setup gata. Pentru lansare: node scripts/robos.js');
    process.exit(0);
  }

  // Reuse-if-running: probe port FIRST (mai sigur decat PID — PID poate fi de alt proces)
  const alreadyResponding = await probe(port);
  if (alreadyResponding.alive) {
    ok(`Dashboard ruleaza deja la ${url}`);
    if (!FLAGS.noBrowser) openBrowser(url);
    state.update({ last_launch_at: new Date().toISOString() });
    process.exit(0);
  }

  // Cleanup stale PID daca procesul e mort
  const pid = readPid();
  if (pid && !isProcessAlive(pid)) {
    clearStalePid();
  } else if (pid && isProcessAlive(pid)) {
    // PID viu dar port n-a raspuns — proces hung. Avertizez si refuz pornirea.
    warn(`PID ${pid} alive dar port ${port} nu raspunde. Probabil hung.`);
    warn(`Investigheaza cu: cat ${SERVER_LOG}`);
    warn(`Forteaza repornire cu: node scripts/robos.js --stop && node scripts/robos.js`);
    process.exit(1);
  }

  // Start dashboard
  const newPid = await startDashboardAsync(port);
  const ready = await waitForReady(port);

  if (!ready) {
    warn(`Dashboard PID ${newPid} nu raspunde la ${url} in 15s`);
    warn(`Verifica logul: ${SERVER_LOG}`);
    process.exit(1);
  }

  ok(`Dashboard pornit la ${url} (PID ${newPid})`);
  if (!FLAGS.noBrowser) openBrowser(url);

  // Update state
  const VERSION = existsSync(join(ROOT, 'VERSION'))
    ? readFileSync(join(ROOT, 'VERSION'), 'utf-8').trim()
    : null;

  state.update({
    last_launch_at: new Date().toISOString(),
    last_robos_version: VERSION,
    bootstrap_valid: true,
    dashboard_port: port,
  });

  console.log('');
  console.log(c('1', 'Pasi urmatori:'));
  console.log('  - Dashboard: ' + c('36', url));
  console.log('  - Pentru chat cu Claude: deschide ' + c('36', 'claude') + ' in alta fereastra de terminal');
  console.log('  - Stop dashboard: ' + c('36', 'node scripts/robos.js --stop'));
}

main().catch((e) => fail(e.message || String(e)));
