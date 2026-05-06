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
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
<p>Salut,</p>

<p>${productLine}</p>

<p>Iata cum incepi:</p>

<p style="margin: 24px 0;">
  <a href="${downloadUrl}" style="background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Descarca robOS</a>
</p>

<p style="font-size: 14px; color: #666;">(link valabil 7 zile, doar pentru tine)</p>

<ol>
  <li>Dezarhiveaza folderul oriunde pe laptop</li>
  <li>Deschide Claude Code in folder</li>
  <li>Scrie: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">onboard me</code></li>
</ol>

<p>Atat. Te ghideaza el de acolo.</p>

<p style="font-size: 14px; color: #666;">Daca n-ai Claude Code instalat, ia-l de aici: <a href="https://claude.com/claude-code">claude.com/claude-code</a></p>

<p>Probleme? Raspunde la acest email.</p>

<p>— Adrian</p>
</body></html>
  `.trim();

  const text = `Salut,

${productLine.replace(/<[^>]+>/g, '')}

Descarca robOS de aici (link valabil 7 zile):
${downloadUrl}

1. Dezarhiveaza folderul
2. Deschide Claude Code in folder
3. Scrie: onboard me

Atat.

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
