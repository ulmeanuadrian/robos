// Resend integration — send transactional emails din Worker.
// Doc: https://resend.com/docs/api-reference/emails/send-email

const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY missing — email not sent');
    return { ok: false, error: 'email_not_configured' };
  }

  const from = `${env.RESEND_FROM_NAME || 'robOS'} <${env.RESEND_FROM_EMAIL || 'noreply@robos.vip'}>`;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, error: body };
  }

  const data = await res.json();
  return { ok: true, id: data.id };
}

// ----------------------------------------------------------------------------
// Templates
// ----------------------------------------------------------------------------

export function welcomeEmail({ email, downloadUrl, isBundle }) {
  const subject = 'robOS e gata — 30 secunde si pornesti';
  const productLine = isBundle
    ? 'Multumim ca te-ai alaturat. Ai luat <b>robOS + FdA bundle</b>.'
    : 'Multumim ca te-ai alaturat.';

  const html = `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
<p>Salut,</p>

<p>${productLine}</p>

<p style="margin: 24px 0;">
  <a href="${downloadUrl}" style="background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Descarca robOS</a>
</p>

<p style="font-size: 14px; color: #666;">(link valabil 7 zile, doar pentru tine)</p>

<h3 style="margin-top: 32px; margin-bottom: 8px;">Inainte de instalare — ai nevoie de 2 lucruri (+ 1 recomandat):</h3>

<p style="margin: 8px 0;"><b>1. Node.js v22.12+</b> — copy-paste comanda potrivita in terminal:</p>
<table style="border-collapse: collapse; margin: 8px 0 16px 0; font-family: -apple-system, monospace; font-size: 13px;">
  <tr><td style="padding: 4px 12px 4px 0; vertical-align: top;"><b>Mac</b></td>
      <td style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">brew install node</code></td></tr>
  <tr><td style="padding: 4px 12px 4px 0; vertical-align: top;"><b>Windows</b></td>
      <td style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">winget install OpenJS.NodeJS.LTS</code></td></tr>
  <tr><td style="padding: 4px 12px 4px 0; vertical-align: top;"><b>Linux</b></td>
      <td style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - &amp;&amp; sudo apt install -y nodejs</code></td></tr>
</table>

<p style="margin: 8px 0;"><b>2. Claude Code CLI</b> — copy-paste in terminal:</p>
<table style="border-collapse: collapse; margin: 8px 0 16px 0; font-family: -apple-system, monospace; font-size: 13px;">
  <tr><td style="padding: 4px 12px 4px 0; vertical-align: top;"><b>Mac/Linux</b></td>
      <td style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">curl -fsSL https://claude.ai/install.sh | sh</code></td></tr>
  <tr><td style="padding: 4px 12px 4px 0; vertical-align: top;"><b>Windows</b></td>
      <td style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">irm https://claude.ai/install.ps1 | iex</code></td></tr>
</table>

<p style="font-size: 13px; color: #666;">Dupa fiecare instalare, deschide o fereastra <b>noua</b> de terminal (PATH refresh).</p>

<p style="margin: 16px 0 8px 0;"><b>3. VSCode</b> <span style="color: #666; font-weight: normal;">(recomandat — gratis)</span></p>
<p style="font-size: 13px; color: #444; margin: 4px 0;">Daca ai VSCode instalat, robOS il deschide automat la primul launch — vei avea folderul deja deschis si terminal integrat unde Claude primeste file context auto. Nu e obligatoriu, dar e mult mai placut decat un PowerShell sec.</p>
<p style="font-size: 13px; margin: 4px 0;">Download: <a href="https://code.visualstudio.com" style="color: #0066cc;">code.visualstudio.com</a></p>
<p style="font-size: 12px; color: #888; margin: 4px 0;">Pe macOS, dupa instalare deschide VSCode → Cmd+Shift+P → "Shell Command: Install 'code' command in PATH" (o singura data).</p>

<h3 style="margin-top: 24px; margin-bottom: 8px;">Instalare (5 minute):</h3>
<ol>
  <li>Click pe butonul <b>Descarca robOS</b> de mai sus → primesti <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">robos-${'$'}{version}.tar.gz</code></li>
  <li>Dezarhiveaza-l oriunde pe laptop (creeaza folder <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">robOS/</code>)</li>
  <li>Deschide terminal in folder si ruleaza ASTA — porneste totul:
    <ul style="margin-top: 6px;">
      <li>Mac/Linux: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">bash scripts/robos</code></li>
      <li>Windows: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">scripts\\robos.cmd</code></li>
      <li>Universal: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">node scripts/robos.js</code></li>
    </ul>
  </li>
  <li>Dashboard-ul se deschide automat la <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">http://localhost:3001</code>. Pentru chat cu Claude, deschide <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">claude</code> in alta fereastra de terminal in folder, apoi scrie <b>onboard me</b>.</li>
</ol>

<p style="font-size: 14px; color: #666; margin-top: 16px;">Optional: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">node scripts/robos.js --install-shortcut</code> adauga comanda <code>robos</code> in shell-ul tau (zsh/bash/PowerShell), ca sa lansezi de oriunde fara sa-i dai path-ul.</p>

<p>Te ghideaza el de acolo. La primul prompt, robOS isi activeaza singur licenta (nu trebuie sa faci nimic special).</p>

<p>Probleme? Raspunde la acest email.</p>

<p>— Adrian</p>
</body></html>
  `.trim();

  const text = `Salut,

${productLine.replace(/<[^>]+>/g, '')}

Descarca robOS de aici (link valabil 7 zile):
${downloadUrl}

INAINTE DE INSTALARE — ai nevoie de 2 lucruri (+ 1 recomandat):

  1. Node.js v22.12+ — copy-paste in terminal:
       Mac:     brew install node
       Windows: winget install OpenJS.NodeJS.LTS
       Linux:   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

  2. Claude Code CLI — copy-paste in terminal:
       Mac/Linux: curl -fsSL https://claude.ai/install.sh | sh
       Windows:   irm https://claude.ai/install.ps1 | iex

  Dupa fiecare instalare, deschide o fereastra NOUA de terminal (PATH refresh).

  3. VSCode (recomandat, gratis): https://code.visualstudio.com
     Daca ai VSCode, robOS il deschide automat la primul launch — folderul deja
     deschis + terminal integrat unde Claude primeste file context auto.
     Pe macOS dupa install: VSCode → Cmd+Shift+P → "Shell Command: Install 'code' in PATH".

INSTALARE (5 minute):
  1. Click pe link -> primesti robos-{version}.tar.gz
  2. Dezarhiveaza folderul oriunde pe laptop (creeaza robOS/)
  3. In terminal, ruleaza ASTA — porneste totul:
       Mac/Linux: bash scripts/robos
       Windows:   scripts\\robos.cmd
       Universal: node scripts/robos.js
  4. Dashboard-ul se deschide la http://localhost:3001.
     Pentru chat: deschide 'claude' in alta fereastra in folder, scrie 'onboard me'.

Optional, pentru launch de oriunde: node scripts/robos.js --install-shortcut
(adauga 'robos' in shell-ul tau)

La primul prompt, robOS isi activeaza singur licenta.

Probleme? Raspunde la acest email.

— Adrian`;

  return { subject, html, text };
}

export function magicLinkEmail({ email, magicUrl }) {
  const subject = 'Link login admin robOS';

  const html = `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
<p>Login admin robOS:</p>
<p style="margin: 24px 0;">
  <a href="${magicUrl}" style="background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Deschide admin</a>
</p>
<p style="font-size: 13px; color: #666;">Link valabil 5 minute. Daca nu ai cerut tu, ignora.</p>
</body></html>
  `.trim();

  const text = `Login admin robOS:\n${magicUrl}\n\nLink valabil 5 minute. Daca nu ai cerut tu, ignora.`;

  return { subject, html, text };
}
