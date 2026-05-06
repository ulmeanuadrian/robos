/**
 * redact.js
 *
 * Single-source-of-truth for credential redaction across robOS.
 *
 * Used by:
 *   - scripts/activity-capture.js (Stop hook — redact before persisting)
 *   - scripts/redact-activity-log.js (one-off remediation of pre-existing logs)
 *
 * Patterns are conservative: each requires a recognizable prefix + minimum
 * tail length. False negatives (a credential we don't know yet) are inevitable;
 * false positives (mangling normal text) would silently corrupt logs, so the
 * regexes are tight.
 *
 * Adding a provider? Append below AND extend the smoke test in this file's
 * comment block (run inline with `node scripts/lib/redact.js --self-test`).
 *
 * Coverage:
 *   - Anthropic / OpenAI / Stripe-style:    sk-ant-*, sk-, sk_test_, sk_live_
 *   - Firecrawl:                            fc-*
 *   - Google API key:                       AIza*
 *   - GitHub PATs:                          ghp_*, gho_*, ghu_*, ghs_*, ghr_*
 *   - Cloudflare API tokens:                cfat_*
 *   - Slack bot/user/app tokens:            xoxb-, xoxp-, xoxa-, xoxr-
 *   - npm automation tokens:                npm_*
 *   - AWS access key id:                    AKIA, ASIA + 16 uppercase
 *   - JWT-shaped (Bearer auth, OIDC):       eyJ.*\..*\..*
 *   - Generic Bearer prefix:                Bearer <token>
 */

const PATTERNS = [
  // Order matters: more specific (sk-ant-) before generic (sk-).
  [/sk-ant-[A-Za-z0-9_-]{20,}/g,                            'sk-ant-****'],
  [/sk_(test|live)_[A-Za-z0-9]{20,}/g,                      'sk_$1_****'],
  [/sk-[A-Za-z0-9_-]{20,}/g,                                'sk-****'],
  [/fc-[A-Za-z0-9]{20,}/g,                                  'fc-****'],
  [/AIza[A-Za-z0-9_-]{20,}/g,                               'AIza****'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g,                           'gh*_****'],
  [/cfat_[A-Za-z0-9_-]{20,}/g,                              'cfat_****'],
  [/xox[bpaors]-[A-Za-z0-9-]{10,}/g,                        'xox*-****'],
  [/npm_[A-Za-z0-9]{30,}/g,                                 'npm_****'],
  [/A(?:KIA|SIA)[A-Z0-9]{16}/g,                             'AKIA****'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,    'eyJ****.****.****'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/gi,                        'Bearer ****'],
];

/**
 * Redact known credential shapes from a string. No-op for non-strings.
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}

// ----- Self-test (run: node scripts/lib/redact.js --self-test) -----
if (process.argv.includes('--self-test')) {
  const cases = [
    ['sk-ant-api03-' + 'A'.repeat(40),                          'sk-ant-****'],
    ['sk_test_' + 'B'.repeat(30),                               'sk_test_****'],
    ['sk_live_' + 'B'.repeat(30),                               'sk_live_****'],
    ['fc-' + 'C'.repeat(25),                                    'fc-****'],
    ['AIza' + 'D'.repeat(35),                                   'AIza****'],
    ['ghp_' + 'E'.repeat(36),                                   'gh*_****'],
    ['cfat_' + 'F'.repeat(40),                                  'cfat_****'],
    ['xoxb-' + '1'.repeat(50),                                  'xox*-****'],
    ['npm_' + 'G'.repeat(36),                                   'npm_****'],
    ['AKIA' + 'A'.repeat(16),                                   'AKIA****'],
    ['Bearer ' + 'H'.repeat(40),                                'Bearer ****'],
    ['normal text without secrets',                              'normal text without secrets'],
  ];
  let failed = 0;
  for (const [input, expected] of cases) {
    const got = redactSensitive(input);
    const ok = got === expected;
    if (!ok) failed++;
    console.log(ok ? 'PASS' : 'FAIL', '|', input.slice(0, 30) + '...', '->', got);
  }
  console.log(failed === 0 ? `\nAll ${cases.length} cases passed.` : `\n${failed}/${cases.length} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
