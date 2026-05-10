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
//   node scripts/robos.js --doctor     # diagnose hooks + lint + smoke (U22)
//   node scripts/robos.js --triggers <kw>  # search skill triggers (U29)
//   node scripts/robos.js --reset-onboarding  # backup brand/+context, restore templates (U25)
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

// Disable Astro telemetry by default — child processes inherit this env var.
// robOS e local-first; nu trimitem date catre Astro nici la setup nici la run.
process.env.ASTRO_TELEMETRY_DISABLED = '1';

const COLORS = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, t) => COLORS ? `\x1b[${code}m${t}\x1b[0m` : t;
const ok = (m) => console.log(c('32', '[OK]'), m);
const info = (m) => console.log(c('36', '[..]'), m);
const warn = (m) => console.log(c('33', '[!!]'), m);
const fail = (m) => { console.error(c('31', '[FAIL]'), m); process.exit(1); };

const argv = process.argv.slice(2);
const args = new Set(argv);
const FLAGS = {
  setupOnly: args.has('--setup-only'),
  noBrowser: args.has('--no-browser'),
  clean: args.has('--clean'),
  stop: args.has('--stop'),
  status: args.has('--status'),
  installShortcut: args.has('--install-shortcut'),
  uninstallShortcut: args.has('--uninstall-shortcut'),
  doctor: args.has('--doctor'),
  triggers: args.has('--triggers'),
  resetOnboarding: args.has('--reset-onboarding'),
};

function getFlagValue(name) {
  const idx = argv.indexOf(name);
  if (idx < 0 || idx + 1 >= argv.length) return null;
  return argv[idx + 1];
}

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

async function commandResetOnboarding() {
  // U25 fix: previously, redoing onboarding required manual deletion of brand/
  // files. Now: backup current brand + USER.md + priorities.md to
  // .archive/onboarding-backup/{ts}/, then exit so user can re-run "onboard me".
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(ROOT, '.archive', 'onboarding-backup', ts);
  mkdirSync(backupDir, { recursive: true });

  const targets = [
    'brand/voice.md',
    'brand/audience.md',
    'brand/positioning.md',
    'brand/samples.md',
    'context/USER.md',
    'context/priorities.md',
    'connections.md',
  ];

  let copied = 0;
  for (const rel of targets) {
    const src = join(ROOT, rel);
    if (!existsSync(src)) continue;
    const dst = join(backupDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    try {
      writeFileSync(dst, readFileSync(src));
      // Reset to template stub (preserve file existence with minimal content)
      const stub = `# ${rel.split('/').pop().replace(/\.md$/, '').replace(/^./, ch => ch.toUpperCase())}\n\n<!-- Reset by --reset-onboarding ${ts}. Re-run "onboard me" to populate. -->\n`;
      writeFileSync(src, stub);
      copied++;
    } catch (err) {
      warn(`Skip ${rel}: ${err.message}`);
    }
  }

  if (copied === 0) {
    info('Nimic de resetat — niciun fisier brand/context populat.');
    process.exit(0);
  }

  ok(`Onboarding resetat. ${copied} fisier(e) backed-up + restored la stub:`);
  console.log(`  Backup: ${backupDir}`);
  console.log('');
  console.log('Pas urmator: deschide ' + c('36', 'claude') + ' si scrie ' + c('36', 'onboard me'));
  console.log('Pentru rollback: copiaza fisierele din backup inapoi peste cele actuale.');
  process.exit(0);
}

async function commandDoctor() {
  console.log(c('1', 'robOS doctor — health diagnostic'));
  console.log('');

  let issues = 0;
  const check = (label, ok, hint) => {
    const tag = ok ? c('32', '[OK]  ') : c('31', '[FAIL]');
    console.log(`  ${tag} ${label}`);
    if (!ok && hint) console.log(`        ${c('90', '→ ' + hint)}`);
    if (!ok) issues++;
  };

  // 1. Required files
  check('VERSION file', existsSync(join(ROOT, 'VERSION')));
  check('.env file', existsSync(join(ROOT, '.env')), 'Run: node scripts/setup-env.js');
  check('skills/_index.json', existsSync(join(ROOT, 'skills', '_index.json')),
    'Run: node scripts/rebuild-index.js');
  check('data/robos.db', existsSync(join(ROOT, 'data', 'robos.db')),
    'Run: node scripts/setup.js');
  check('.claude/settings.json', existsSync(join(ROOT, '.claude', 'settings.json')),
    'Hooks not wired — re-run setup');

  // 2. Hook scripts exist
  const hookScripts = [
    'hook-user-prompt.js',
    'hook-post-tool.js',
    'checkpoint-reminder.js',
    'activity-capture.js',
    'note-candidates.js',
  ];
  for (const h of hookScripts) {
    check(`scripts/${h}`, existsSync(join(ROOT, 'scripts', h)));
  }

  // 3. Recent hook errors
  const errSink = join(ROOT, 'data', 'hook-errors.ndjson');
  if (existsSync(errSink)) {
    try {
      const lines = readFileSync(errSink, 'utf-8').trim().split('\n').filter(Boolean);
      if (lines.length > 0) {
        const recent = lines.slice(-3).map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        console.log('');
        console.log(c('33', `  [WARN]`), `${lines.length} hook errors total. Recent (last 3):`);
        for (const e of recent) {
          console.log(c('90', `    - ${e.ts} ${e.source || '?'}: ${(e.message || '').slice(0, 80)}`));
        }
      } else {
        check('hook-errors.ndjson clean', true);
      }
    } catch { /* skip */ }
  } else {
    check('hook-errors.ndjson absent (no errors recorded)', true);
  }

  // 4. Smoke quick run (smoke-all)
  console.log('');
  console.log(c('1', 'Smoke tests:'));
  const smokeAll = join(ROOT, 'scripts', 'smoke-all.js');
  if (existsSync(smokeAll)) {
    try {
      // Set ROBOS_INSIDE_DOCTOR=1 so smoke-doctor-coverage knows it's running
      // inside a doctor invocation and skips the recursive live spawn (would
      // otherwise hang: doctor → smoke-all → smoke-doctor-coverage → doctor → ...).
      const result = execSync(`node "${smokeAll}" --quick`, {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, ROBOS_INSIDE_DOCTOR: '1' },
      });
      const lastLine = result.trim().split('\n').filter(l => l.includes('green')).pop();
      if (lastLine) console.log('  ' + lastLine);
      else console.log('  (smoke output empty)');
    } catch (e) {
      console.log(c('31', '  [FAIL]'), 'smoke-all failed. See above.');
      issues++;
    }
  } else {
    check('scripts/smoke-all.js', false, 'Smoke runner missing');
  }

  // 5. Lint portability
  const lintPort = join(ROOT, 'scripts', 'lint-portability.js');
  if (existsSync(lintPort)) {
    try {
      const result = execSync(`node "${lintPort}"`, { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' });
      const blockMatch = result.match(/BLOCK:\s+(\d+)/);
      const warnMatch = result.match(/WARN:\s+(\d+)/);
      const blocks = blockMatch ? parseInt(blockMatch[1], 10) : -1;
      const warns = warnMatch ? parseInt(warnMatch[1], 10) : -1;
      check(`lint-portability (${blocks} BLOCK, ${warns} WARN)`, blocks === 0,
        blocks > 0 ? 'Cross-platform issues detected — see lint output' : null);
    } catch {
      console.log(c('33', '  [WARN]'), 'lint-portability returned non-zero (BLOCK present)');
      issues++;
    }
  }

  console.log('');
  if (issues === 0) {
    console.log(c('32', `[OK] Toate verificarile au trecut. robOS e sanatos.`));
  } else {
    console.log(c('31', `[FAIL] ${issues} probleme detectate. Vezi sugestiile de mai sus.`));
  }
  process.exit(issues === 0 ? 0 : 1);
}

function commandTriggers() {
  const keyword = getFlagValue('--triggers');
  const indexPath = join(ROOT, 'skills', '_index.json');
  if (!existsSync(indexPath)) {
    fail('skills/_index.json missing — run: node scripts/rebuild-index.js');
  }
  let index;
  try { index = JSON.parse(readFileSync(indexPath, 'utf-8')); }
  catch (e) { fail(`Cannot parse _index.json: ${e.message}`); }

  const triggers = index.triggers || {};
  const allTriggers = Object.keys(triggers).sort();

  let filtered = allTriggers;
  if (keyword && keyword.trim()) {
    const kw = keyword.toLowerCase();
    filtered = allTriggers.filter(t => t.toLowerCase().includes(kw) || (triggers[t] || '').toLowerCase().includes(kw));
  }

  if (filtered.length === 0) {
    console.log(`Niciun trigger gasit pentru: "${keyword}"`);
    process.exit(0);
  }

  console.log(c('1', `${filtered.length} trigger(s)${keyword ? ` matching "${keyword}"` : ''}:`));
  console.log('');

  // Group by skill
  const bySkill = {};
  for (const t of filtered) {
    const skill = triggers[t];
    if (!bySkill[skill]) bySkill[skill] = [];
    bySkill[skill].push(t);
  }

  for (const skill of Object.keys(bySkill).sort()) {
    console.log(c('36', `  [${skill}]`));
    for (const t of bySkill[skill]) console.log(`    "${t}"`);
    console.log('');
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
  if (FLAGS.doctor) await commandDoctor();
  if (FLAGS.triggers) commandTriggers();
  if (FLAGS.resetOnboarding) await commandResetOnboarding();

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

  // First-run editor offer (one-shot): auto-open VSCode if available.
  // Skips silently when re-launching, when already inside VSCode, or after first offer.
  const editorMod = await import('./lib/editor.js');
  const editorOutcome = editorMod.offerEditor({
    folder: ROOT,
    alreadyOffered: s.editor_offered,
    info,
  });
  if (editorOutcome === 'opened' || editorOutcome === 'hinted') {
    state.update({ editor_offered: true });
  }

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

  // Adapteaza hint-ul de chat la editor: in VSCode → terminal integrat; altfel → fereastra noua.
  const inVSCode = editorOutcome === 'inside' || editorOutcome === 'opened';
  const claudeHint = inVSCode
    ? 'In VSCode: View → Terminal (Ctrl+`) → ruleaza ' + c('36', 'claude')
    : 'Pentru chat cu Claude: deschide ' + c('36', 'claude') + ' in alta fereastra de terminal';

  console.log('');
  console.log(c('1', 'Pasi urmatori:'));
  console.log('  - Dashboard: ' + c('36', url));
  console.log('  - ' + claudeHint);
  console.log('  - Stop dashboard: ' + c('36', 'node scripts/robos.js --stop'));
}

main().catch((e) => fail(e.message || String(e)));
