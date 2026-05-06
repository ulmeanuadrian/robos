/**
 * Smoke test for note-candidates.js detection logic.
 *
 * Standalone — does not invoke the full hook (which needs a real session
 * transcript). Re-uses the detection by extracting the function via
 * dynamic import side-effect-free. Since note-candidates.js calls main()
 * on import, we can't reuse it directly without refactor. Instead we copy
 * the detection regexes here (small, deliberate duplication for testability).
 *
 * Run: node scripts/smoke-note-candidates.js
 */

const PATTERNS = [
  { trigger: 'decizie',    re: /^[\s\-*]*(?:Decizie|Decid)\s*:\s*(.+?)\s*$/gim },
  { trigger: 'regula',     re: /^[\s\-*]*(?:Regula|Rule)\s*:\s*(.+?)\s*$/gim },
  { trigger: 'important',  re: /^[\s\-*]*Important\s*:\s*(.+?)\s*$/gim },
  { trigger: 'tine-minte', re: /^[\s\-*]*(?:Tine minte|Remember)\s*:\s*(.+?)\s*$/gim },
];

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function detect(text) {
  const cleaned = stripCode(text || '');
  const out = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(cleaned)) !== null) {
      out.push({ trigger: p.trigger, excerpt: m[1].trim() });
    }
  }
  return out;
}

const sample = `
Intro text fara semnal.

Decizie: SQLite FTS5 ramane index, markdown e canonic.
Regula: nu lasa Obsidian sa fie sursa de adevar.
Important: setup-ul nu primeste prompt-uri noi la install.

Tine minte: studentul nu trebuie sa instaleze Obsidian.

Acum un block de cod care NU trebuie capturat:

\`\`\`
Decizie: asta e doar exemplu in code block.
Regula: niciodata sa nu capturezi din code blocks.
\`\`\`

Si linie inline cu \`Decizie: in inline code\` — tot ignorata.

Pattern: asta nu e in lista de patterns, deci nu apare.
`;

const found = detect(sample);
console.log(`Detected ${found.length} candidates:`);
for (const c of found) console.log(`  [${c.trigger}] ${c.excerpt}`);

// Expected: 4 (decizie, regula, important, tine-minte from non-code section).
const expected = 4;
if (found.length !== expected) {
  console.error(`FAIL: expected ${expected}, got ${found.length}`);
  process.exit(1);
}
console.log('PASS');
