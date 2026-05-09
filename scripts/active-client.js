#!/usr/bin/env node
/**
 * active-client.js
 *
 * CLI for the active-client mechanism. Wraps scripts/lib/client-context.js
 * with a friendly Romanian terminal interface that the sys-switch-client
 * skill, dashboard, and operator can all call.
 *
 * Usage:
 *   node scripts/active-client.js                  Status + list
 *   node scripts/active-client.js status           Status only (compact)
 *   node scripts/active-client.js list             List clients
 *   node scripts/active-client.js set <slug>       Switch to <slug>
 *   node scripts/active-client.js clear            Back to root workspace
 *   node scripts/active-client.js json             Machine-readable status
 *
 * Exit codes:
 *   0  ok
 *   1  invalid command
 *   2  validation/missing client error
 */

import {
  getActiveClient,
  setActiveClient,
  clearActiveClient,
  listClients,
} from './lib/client-context.js';

function printStatus() {
  const active = getActiveClient();
  if (active) {
    console.log(`Client activ: ${active.slug} (${active.name})`);
    console.log(`Switched at:  ${active.switched_at}`);
    if (active.switched_from) {
      console.log(`Switched from: ${active.switched_from}`);
    }
  } else {
    console.log('Niciun client activ — workspace root.');
  }
}

function printList() {
  const clients = listClients();
  if (clients.length === 0) {
    console.log('Niciun client creat. Foloseste: bash scripts/add-client.sh <slug>');
    return;
  }
  const active = getActiveClient();
  const activeSlug = active ? active.slug : null;
  console.log('Clienti disponibili:');
  for (const c of clients) {
    const marker = c.slug === activeSlug ? '*' : ' ';
    const flags = [
      c.has_brand ? 'brand' : 'no-brand',
      c.has_user_md ? 'user' : 'no-user',
    ].join('|');
    console.log(`  ${marker} ${c.slug.padEnd(24)} ${c.name.padEnd(28)} [${flags}]`);
  }
  if (active) {
    console.log('\n* = activ');
  }
}

function cmdSet(slug) {
  if (!slug) {
    console.error('EROARE: lipseste slug. Folosire: node scripts/active-client.js set <slug>');
    process.exit(1);
  }
  try {
    const result = setActiveClient(slug);
    console.log(`OK. Lucrezi acum pentru: ${result.slug} (${result.name})`);
    console.log(`Brand, context, memorie si projects/ se rezolva din clients/${result.slug}/.`);
    if (result.switched_from) {
      console.log(`Anterior: ${result.switched_from}.`);
    }
  } catch (e) {
    console.error(`EROARE: ${e.message}`);
    process.exit(2);
  }
}

function cmdClear() {
  const previous = clearActiveClient();
  if (previous) {
    console.log(`OK. Iesit din clientul "${previous.slug}". Workspace activ acum: root.`);
  } else {
    console.log('Niciun client activ. Nu am ce sa curat.');
  }
}

function cmdJson() {
  const active = getActiveClient();
  const clients = listClients();
  const out = {
    active: active || null,
    clients,
    robos_root: process.cwd(),
    queried_at: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));
}

function printHelp() {
  console.log(`Folosire:
  node scripts/active-client.js                Status + lista
  node scripts/active-client.js status         Doar status
  node scripts/active-client.js list           Doar lista clienti
  node scripts/active-client.js set <slug>     Comuta pe client
  node scripts/active-client.js clear          Inapoi la workspace root
  node scripts/active-client.js json           Output JSON (pentru dashboard / scripts)

Pentru a CREA un client nou: bash scripts/add-client.sh <slug> [nume-afisat]`);
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || '').toLowerCase();

  switch (cmd) {
    case '':
      printStatus();
      console.log('');
      printList();
      break;
    case 'status':
      printStatus();
      break;
    case 'list':
      printList();
      break;
    case 'set':
    case 'use':
    case 'switch':
      cmdSet(argv[1]);
      break;
    case 'clear':
    case 'reset':
    case 'root':
      cmdClear();
      break;
    case 'json':
      cmdJson();
      break;
    case 'help':
    case '-h':
    case '--help':
      printHelp();
      break;
    default:
      console.error(`Comanda necunoscuta: "${cmd}". Foloseste --help pentru lista.`);
      process.exit(1);
  }
}

main();
