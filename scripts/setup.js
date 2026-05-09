#!/usr/bin/env node
// Cross-platform robOS setup — runs identically on Windows, macOS, Linux.
// Replaces the bash-only setup.sh for student install.
//
// Steps (idempotent — safe to re-run):
//   1. Verify Node >= 22.12.0 (Astro dependency)
//   2. Install centre/ dependencies (npm install)
//   3. Build the dashboard (astro build)
//   4. Initialize SQLite DB via centre/scripts/init-db.js
//   5. Bootstrap .env from .env.example (preserves existing keys)
//   6. Rebuild skills index
//   7. Ensure context/ subfolders exist
//   8. Seed decision-journal from template (if missing)
//   9. Print "next steps"
//
// Non-goals: prompting for user name/business — that lives in sys-onboard
// where Claude can do a proper interview instead of single-line readline.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Disable Astro telemetry by default — child processes inherit this env var.
// robOS e local-first; nu trimitem date catre Astro nici la setup nici la run.
process.env.ASTRO_TELEMETRY_DISABLED = '1';

const COLORS = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => COLORS ? `\x1b[${code}m${text}\x1b[0m` : text;
const ok = (msg) => console.log(c('32', '[OK]'), msg);
const skip = (msg) => console.log(c('90', '[SKIP]'), msg);
const info = (msg) => console.log(c('36', '[..]'), msg);
const fail = (msg) => { console.error(c('31', '[FAIL]'), msg); process.exit(1); };

function header() {
  console.log('');
  console.log(c('1', '=== robOS Setup ==='));
  console.log('');
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  const tooOld = major < 22 || (major === 22 && minor < 12);
  if (tooOld) {
    fail(
      `Detectat Node.js v${process.versions.node}. robOS necesita Node >= 22.12.0 (Astro dependency).\n` +
      `  Upgrade de la https://nodejs.org (descarca LTS) sau prin nvm: nvm install 22.12.0`
    );
  }
  ok(`Node.js v${process.versions.node}`);
}

function checkClaude() {
  const cmd = platform() === 'win32' ? 'where' : 'which';
  const res = spawnSync(cmd, ['claude'], { stdio: 'ignore', shell: false });
  if (res.status === 0) {
    ok('Claude Code CLI gasit');
  } else {
    console.log('');
    console.log(c('33', 'ATENTIE'), 'Claude Code CLI nu e in PATH.');
    console.log('  robOS are nevoie de Claude Code pentru a functiona.');
    console.log('  Instalare: https://claude.com/claude-code');
    console.log('  Continui setup-ul, dar va trebui sa-l instalezi inainte sa lansezi `claude`.');
    console.log('');
  }
}

function runShell(cmd, cwd, label) {
  info(label);
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch (e) {
    fail(`${label} esuat (${e.message})`);
  }
}

function runNode(scriptPath, args = [], label) {
  info(label);
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit', shell: false });
  if (res.status !== 0) fail(`${label} esuat (exit ${res.status})`);
}

function setupCentre() {
  const centrePkg = join(ROOT, 'centre', 'package.json');
  if (!existsSync(centrePkg)) {
    skip('centre/ nu exista — Command Centre nu va fi disponibil');
    return;
  }
  runShell('npm install --silent', join(ROOT, 'centre'), 'Instalez dependinte centre/');
  ok('Dependinte centre/ instalate');

  runShell('npx astro build', join(ROOT, 'centre'), 'Build dashboard');
  ok('Dashboard build complet');

  const initDb = join(ROOT, 'centre', 'scripts', 'init-db.js');
  if (existsSync(initDb)) {
    runNode(initDb, [], 'Initializez baza de date');
    const dbPath = join(ROOT, 'data', 'robos.db');
    if (!existsSync(dbPath)) fail(`DB nu s-a creat la ${dbPath}`);
    ok('DB gata');
  }
}

function setupEnv() {
  const setupEnvScript = join(ROOT, 'scripts', 'setup-env.js');
  if (existsSync(setupEnvScript)) {
    runNode(setupEnvScript, [], 'Bootstrap .env');
  } else {
    const example = join(ROOT, '.env.example');
    const env = join(ROOT, '.env');
    if (!existsSync(env) && existsSync(example)) {
      copyFileSync(example, env);
      ok('Creat .env din .env.example');
    } else if (existsSync(env)) {
      skip('.env exista deja');
    }
  }
}

function rebuildSkillsIndex() {
  const script = join(ROOT, 'scripts', 'rebuild-index.js');
  if (existsSync(script)) {
    runNode(script, [], 'Regenerez skills/_index.json');
  }
}

function ensureDirs() {
  for (const dir of ['context/memory', 'context/audits', 'context/notes', 'projects', 'cron/jobs']) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) mkdirSync(full, { recursive: true });
  }
  ok('Directoare context/ + projects/ + cron/ pregatite');
}

function ensureScriptsExecutable() {
  // On Mac/Linux: ensure bash wrappers have +x bit (git on Windows may have
  // dropped it if core.fileMode=false on commit machine). No-op on Windows
  // (chmod is meaningless on NTFS, but Node fakes the call without error).
  if (platform() === 'win32') return;
  const wrappers = [
    'scripts/robos',
    'scripts/setup.sh',
    'scripts/start.sh',
    'scripts/stop.sh',
    'scripts/update.sh',
    'scripts/start-crons.sh',
    'scripts/status-crons.sh',
    'scripts/stop-crons.sh',
    'scripts/add-skill.sh',
    'scripts/remove-skill.sh',
    'scripts/list-skills.sh',
    'scripts/add-client.sh',
  ];
  let chmoded = 0;
  for (const rel of wrappers) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    try {
      chmodSync(path, 0o755);
      chmoded++;
    } catch { /* ignore — best effort */ }
  }
  if (chmoded > 0) ok(`Scripts +x pe ${chmoded} wrappers (Mac/Linux)`);
}

function seedDecisionJournal() {
  const target = join(ROOT, 'context', 'decision-journal.md');
  const template = join(ROOT, 'context', 'decision-journal.template.md');
  if (!existsSync(target) && existsSync(template)) {
    copyFileSync(template, target);
    ok('Creat context/decision-journal.md din template');
  }
}

function nextSteps() {
  console.log('');
  console.log(c('1', '==================================='));
  console.log(c('1', ' robOS e gata.'));
  console.log('');
  console.log(' Pasi urmatori:');
  console.log('   1. Deschide ' + c('36', 'claude') + ' in acest director (sau VS Code cu extensia Claude Code)');
  console.log('   2. Scrie: ' + c('36', 'onboard me'));
  console.log('   3. Raspunzi la 5 intrebari (~15 min) si robOS e configurat.');
  console.log('');
  console.log(' Optional: editeaza .env pentru a adauga chei API (Firecrawl, OpenAI, etc.).');
  console.log(' Optional: porneste dashboard-ul cu ' + c('36', 'npm start --prefix centre'));
  console.log(c('1', '==================================='));
}

// Main
header();
checkNode();
checkClaude();
setupCentre();
setupEnv();
rebuildSkillsIndex();
ensureDirs();
ensureScriptsExecutable();
seedDecisionJournal();
nextSteps();
