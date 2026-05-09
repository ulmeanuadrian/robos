#!/usr/bin/env node
// scripts/add-client.js — Cross-platform client workspace creator.
//
// Creeaza un workspace nou pentru un client in clients/{slug}/.
// Replaces add-client.sh (bash-only). Logic identica, runs on Windows + Mac.
//
// Usage:
//   node scripts/add-client.js <slug> [nume-afisat]
//   scripts\add-client.cmd <slug> [nume-afisat]   (Windows wrapper)
//   ./scripts/add-client.sh <slug> [nume-afisat]  (Mac/Linux wrapper, thin)

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const CLIENTS_DIR = join(ROBOS_ROOT, 'clients');

// Same regex as scripts/lib/client-context.js (single source of validation).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function listExistingClients() {
  if (!existsSync(CLIENTS_DIR)) return [];
  try {
    return readdirSync(CLIENTS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => e.name);
  } catch { return []; }
}

function usage() {
  console.error('Folosire: node scripts/add-client.js <client-slug> [nume-afisat]');
  console.error('');
  console.error('Creeaza un workspace nou de client.');
  console.error('');
  console.error('  client-slug   Lowercase, doar liniute (ex: acme-corp)');
  console.error('  nume-afisat   Numele afisat (optional, default = slug)');
  console.error('');
  console.error('Clienti existenti:');
  const existing = listExistingClients();
  if (existing.length === 0) console.error('  (niciunul)');
  else for (const slug of existing) console.error('  ' + slug);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) usage();

const SLUG = args[0];
const CLIENT_NAME = args[1] || SLUG;
const CLIENT_DIR = join(CLIENTS_DIR, SLUG);

// Validate slug
if (!SLUG_RE.test(SLUG)) {
  console.error(`EROARE: Slug invalid '${SLUG}'. Foloseste lowercase, cifre si liniute.`);
  process.exit(1);
}

if (existsSync(CLIENT_DIR)) {
  console.error(`EROARE: Clientul '${SLUG}' deja exista la ${CLIENT_DIR}`);
  process.exit(1);
}

// Create workspace structure
for (const sub of ['brand', 'context', 'projects', join('cron', 'jobs')]) {
  mkdirSync(join(CLIENT_DIR, sub), { recursive: true });
}

// Brand files: copy from root template if available, otherwise create with title heading
for (const f of ['voice.md', 'audience.md', 'positioning.md', 'samples.md']) {
  const src = join(ROBOS_ROOT, 'brand', f);
  const dst = join(CLIENT_DIR, 'brand', f);
  if (existsSync(src)) {
    copyFileSync(src, dst);
  } else {
    const title = f.replace(/\.md$/, '').replace(/^./, c => c.toUpperCase());
    writeFileSync(dst, `# ${title}\n`, 'utf-8');
  }
}

// Context files
const today = new Date().toISOString().slice(0, 10);

writeFileSync(join(CLIENT_DIR, 'context', 'USER.md'),
  `# Profil Client\n\nNume: ${CLIENT_NAME}\nSlug: ${SLUG}\nCreat: ${today}\n\n## Note\n(Adauga context specific clientului aici)\n`,
  'utf-8');

writeFileSync(join(CLIENT_DIR, 'context', 'learnings.md'),
  `# Learnings — ${CLIENT_NAME}\n\n## General\n(Insights cross-skill pentru acest client)\n`,
  'utf-8');

mkdirSync(join(CLIENT_DIR, 'context', 'memory'), { recursive: true });

// Client-specific CLAUDE.md
writeFileSync(join(CLIENT_DIR, 'CLAUDE.md'),
  `# Client: ${CLIENT_NAME}\n\nCand lucrezi la acest client, incarca contextul de aici, nu din root:\n` +
  `- Brand files: clients/${SLUG}/brand/\n- User context: clients/${SLUG}/context/USER.md\n` +
  `- Memory: clients/${SLUG}/context/memory/\n- Output: clients/${SLUG}/projects/\n\n` +
  `SOUL.md si skills din root raman valide. Doar brand/context se schimba.\n`,
  'utf-8');

console.log(`[OK] Workspace client creat: ${CLIENT_DIR}`);
console.log('');
console.log('Structura:');
console.log(`  ${CLIENT_DIR}/`);
console.log('    brand/          — Fisiere brand client');
console.log('    context/        — Context si memorie client');
console.log('    projects/       — Livrabile client');
console.log('    cron/jobs/      — Joburi cron specifice clientului');
console.log('    CLAUDE.md       — Instructiuni client-specific');
console.log('');
console.log('Pas urmator: completeaza brand/ pentru acest client.');
