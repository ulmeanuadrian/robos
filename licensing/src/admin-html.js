// Admin dashboard SPA — un singur fisier HTML+JS embedded.
// Routare client-side simpla: login | dashboard | license detail.

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>robOS Admin</title>
<style>
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #fafafa; color: #1a1a1a; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e5e5e5; }
  .header .nav { font-size: 13px; color: #666; }
  .header .nav a { color: #555; text-decoration: none; margin-left: 16px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat { background: white; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 16px; }
  .stat .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; border: 1px solid #e5e5e5; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  th { background: #f5f5f5; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #555; letter-spacing: 0.3px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; cursor: pointer; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.active { background: #e8f5e9; color: #2e7d32; }
  .badge.revoked { background: #ffebee; color: #c62828; }
  .badge.expired { background: #fff3e0; color: #ef6c00; }
  button, .btn { background: #1a1a1a; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 500; }
  button:hover, .btn:hover { background: #333; }
  button.danger { background: #c62828; }
  button.danger:hover { background: #b71c1c; }
  button.secondary { background: white; color: #1a1a1a; border: 1px solid #ccc; }
  button.secondary:hover { background: #f5f5f5; }
  input[type="text"], input[type="email"], input[type="number"], select, textarea {
    width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit;
  }
  label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; font-weight: 500; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  .toolbar input { flex: 1; }
  .center { text-align: center; padding: 80px 20px; }
  .center input { max-width: 320px; margin: 16px auto; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-start; justify-content: center; padding-top: 60px; z-index: 100; }
  .modal { background: white; border-radius: 8px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
  .modal-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
  .modal-header h2 { margin: 0; }
  .modal-close { background: none; color: #666; padding: 4px 8px; }
  .modal-close:hover { background: #f0f0f0; color: #1a1a1a; }
  .actions-row { display: flex; gap: 8px; margin-top: 20px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
  .muted { color: #666; font-size: 12px; }
  .empty { padding: 40px; text-align: center; color: #999; }
  .events-list { background: white; border: 1px solid #e5e5e5; border-radius: 6px; max-height: 400px; overflow-y: auto; }
  .event { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 12px; display: flex; gap: 12px; }
  .event:last-child { border-bottom: none; }
  .event .time { color: #999; min-width: 130px; font-variant-numeric: tabular-nums; }
  .event .type { font-weight: 600; min-width: 120px; }
  .event .details { color: #555; flex: 1; word-break: break-all; }
</style>
</head>
<body>
<main id="app"></main>

<script type="module">
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const app = $('#app');

const state = {
  view: 'loading',
  stats: null,
  licenses: [],
  selected: null,
  search: '',
};

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMoney(cents) {
  if (!cents) return '—';
  return '€' + (cents / 100).toFixed(2);
}

function badge(status) {
  return \`<span class="badge \${status}">\${status}</span>\`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    state.view = 'login';
    render();
    throw new Error('unauthorized');
  }
  return res.json();
}

async function checkAuthAndLoad() {
  const r = await fetch('/admin/api/stats', { credentials: 'same-origin' });
  if (r.status === 401) {
    state.view = 'login';
    render();
    return;
  }
  const data = await r.json();
  state.stats = data.stats;
  await loadLicenses();
  state.view = 'dashboard';
  render();
}

async function loadLicenses() {
  const r = await api('/admin/api/licenses?q=' + encodeURIComponent(state.search));
  state.licenses = r.licenses || [];
}

async function viewLicense(id) {
  state.selected = await api('/admin/api/license/' + id);
  render();
}

async function revokeLicense(id) {
  if (!confirm('Revoca licenta ' + id + '? Userul nu va mai putea folosi robOS dupa urmatorul refresh.')) return;
  await api('/admin/api/license/' + id + '/revoke', { method: 'POST' });
  await viewLicense(id);
  await loadLicenses();
  render();
}

async function createLicense(form) {
  const body = {
    email: form.email.value.trim(),
    tier: form.tier.value,
    bundle_with_fda: form.bundle.checked,
    amount_cents: form.amount_cents.value ? parseInt(form.amount_cents.value) : null,
    notes: form.notes.value.trim() || null,
    send_email: form.send_email.checked,
    source: 'manual',
  };
  if (!body.email) return alert('Email obligatoriu');

  // Apel la api.robos.vip cu LICENSE_INTERNAL_API_TOKEN — dar acela nu e in dashboard.
  // Solutie: adaugam endpoint admin /admin/api/licenses/create care intern apeleaza createLicense.
  // Pentru prima versiune, pas separat — TODO.
  alert('Generare manuala in V2 — pentru moment, foloseste curl direct la /internal/licenses/create cu token-ul.');
}

function render() {
  if (state.view === 'loading') {
    app.innerHTML = '<div class="center">Se incarca...</div>';
    return;
  }

  if (state.view === 'login') {
    const loggedOut = new URLSearchParams(location.search).has('logged_out');
    app.innerHTML = \`
      <div class="center">
        <h1>robOS Admin</h1>
        <p class="muted" style="margin-top: 24px;">
          \${loggedOut ? 'Te-ai delogat.' : 'Sesiune expirata sau lipsa cookie.'}
        </p>
        <p style="margin-top: 24px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.7;">
          Ca sa intri:
        </p>
        <ol style="text-align: left; max-width: 420px; margin: 16px auto; line-height: 1.8;">
          <li>Acceseaza bookmark-ul "robOS Admin" din browser-ul tau (URL contine <code>?token=...</code>)</li>
          <li>Vei fi logat automat pentru 24h</li>
        </ol>
        <p class="muted" style="margin-top: 24px; font-size: 12px;">
          Daca n-ai bookmark inca, salveaza:<br>
          <code style="font-size: 11px;">https://admin.robos.vip/?token=&lt;tokenul tau din .env LICENSE_INTERNAL_API_TOKEN&gt;</code>
        </p>
      </div>
    \`;
    return;
  }

  if (state.view === 'dashboard') {
    const s = state.stats || {};
    const licensesHtml = state.licenses.length === 0
      ? '<div class="empty">Nicio licenta inca</div>'
      : \`
        <table>
          <thead><tr>
            <th>Email</th><th>Status</th><th>Tier</th><th>Sursa</th><th>Suma</th><th>Creat</th>
          </tr></thead>
          <tbody>
            \${state.licenses.map(l => \`
              <tr data-id="\${l.id}">
                <td>\${l.email}</td>
                <td>\${badge(l.status)}</td>
                <td>\${l.tier}\${l.bundle_with_fda ? ' + FdA' : ''}</td>
                <td>\${l.source}</td>
                <td>\${fmtMoney(l.amount_cents)}</td>
                <td class="muted">\${fmtDate(l.created_at)}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;

    app.innerHTML = \`
      <div class="header">
        <h1>robOS Admin</h1>
        <div class="nav">
          <span class="muted">conectat ca admin</span>
          <a href="/logout">logout</a>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="label">Active</div><div class="value">\${s.active_licenses ?? 0}</div></div>
        <div class="stat"><div class="label">Revocate</div><div class="value">\${s.revoked_licenses ?? 0}</div></div>
        <div class="stat"><div class="label">Binds active</div><div class="value">\${s.active_binds ?? 0}</div></div>
        <div class="stat"><div class="label">Revenue 30z</div><div class="value">\${fmtMoney(s.last_30d_revenue_cents)}</div></div>
      </div>

      <div class="toolbar">
        <input type="text" id="search" placeholder="cauta email / id / note..." value="\${state.search}">
        <button id="newLicenseBtn">+ Genereaza licenta</button>
      </div>

      \${licensesHtml}
    \`;

    let searchTimer;
    $('#search').addEventListener('input', (e) => {
      state.search = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        await loadLicenses();
        render();
      }, 250);
    });

    $('#newLicenseBtn').addEventListener('click', () => {
      state.view = 'create';
      render();
    });

    $$('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => viewLicense(tr.dataset.id));
    });

    if (state.selected) renderLicenseModal();
    return;
  }

  if (state.view === 'create') {
    app.innerHTML = \`
      <div class="header">
        <h1>Genereaza licenta noua</h1>
        <div class="nav"><a href="#" id="back">inapoi</a></div>
      </div>
      <form id="createForm" style="max-width: 480px;">
        <label>Email cumparator</label>
        <input type="email" name="email" required placeholder="cumparator@example.com">

        <label>Tier</label>
        <select name="tier">
          <option value="standard">Standard (€197 robOS)</option>
          <option value="bundle">Bundle (€597.50 robOS + FdA)</option>
        </select>

        <label><input type="checkbox" name="bundle"> Vandut in bundle cu FdA (raportare)</label>

        <label>Suma (centi EUR, optional)</label>
        <input type="number" name="amount_cents" placeholder="19700">

        <label>Note interne</label>
        <textarea name="notes" rows="3" placeholder="beta tester / cadou / etc."></textarea>

        <p class="muted" style="margin-top: 16px; font-size: 12px; line-height: 1.5;">
          Worker-ul NU trimite email. Dupa create, primesti download_url —
          il copy-paste in app-ul tau de plata sau il trimiti manual.
        </p>

        <div class="actions-row">
          <button type="submit">Genereaza</button>
          <button type="button" class="secondary" id="cancelBtn">Anuleaza</button>
        </div>
      </form>
    \`;
    $('#back').onclick = () => { state.view = 'dashboard'; render(); };
    $('#cancelBtn').onclick = () => { state.view = 'dashboard'; render(); };
    $('#createForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = {
        email: f.email.value.trim(),
        tier: f.tier.value,
        bundle_with_fda: f.bundle.checked,
        amount_cents: f.amount_cents.value ? parseInt(f.amount_cents.value) : null,
        notes: f.notes.value.trim() || null,
      };
      if (!body.email) return alert('Email obligatoriu');

      const submitBtn = f.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Se genereaza...';

      try {
        const r = await api('/admin/api/licenses/create', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (r.ok) {
          prompt('Licenta creata. Copy download URL:', r.download_url);
          state.view = 'dashboard';
          await loadLicenses();
          render();
        } else {
          alert('Eroare: ' + (r.error || 'unknown'));
        }
      } catch (err) {
        alert('Eroare: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Genereaza';
      }
    });
    return;
  }
}

function renderLicenseModal() {
  const { license, binds, events } = state.selected;
  const modalHtml = \`
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" style="max-width: 720px;">
        <div class="modal-header">
          <h2>\${license.email}</h2>
          <button class="modal-close" id="closeModal">×</button>
        </div>

        <p class="muted">ID: \${license.id}</p>
        <p>Status: \${badge(license.status)} • Tier: \${license.tier}\${license.bundle_with_fda ? ' + FdA' : ''} • \${fmtMoney(license.amount_cents)}</p>
        <p class="muted">Creat \${fmtDate(license.created_at)}\${license.expires_at ? ', expira ' + fmtDate(license.expires_at) : ''}</p>
        \${license.notes ? '<p>Note: ' + license.notes + '</p>' : ''}

        <h2>Activari (\${binds.length})</h2>
        \${binds.length === 0 ? '<p class="muted">Nicio activare inca.</p>' : \`
          <table style="margin-bottom: 12px;">
            <thead><tr><th>Hardware</th><th>OS</th><th>Versiune</th><th>Bound</th><th>Ultima</th></tr></thead>
            <tbody>
              \${binds.map(b => \`
                <tr>
                  <td><code>\${b.hardware_hash.slice(0, 12)}...</code></td>
                  <td>\${b.os || '—'}</td>
                  <td>\${b.robos_version || '—'}</td>
                  <td class="muted">\${fmtDate(b.bound_at)}</td>
                  <td class="muted">\${fmtDate(b.last_seen_at)}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`}

        <h2>Istoric</h2>
        <div class="events-list">
          \${events.map(e => \`
            <div class="event">
              <div class="time">\${fmtDate(e.created_at)}</div>
              <div class="type">\${e.event_type}</div>
              <div class="details">\${e.details ? escapeHtml(e.details) : ''}</div>
            </div>
          \`).join('')}
        </div>

        <div class="actions-row">
          \${license.status === 'active'
            ? '<button class="danger" id="revokeBtn">Revoca licenta</button>'
            : ''}
          <button class="secondary" id="closeBtn">inchide</button>
        </div>
      </div>
    </div>
  \`;

  const old = $('#modalOverlay');
  if (old) old.remove();

  app.insertAdjacentHTML('beforeend', modalHtml);

  const close = () => {
    state.selected = null;
    $('#modalOverlay').remove();
  };
  $('#closeModal').onclick = close;
  $('#closeBtn').onclick = close;
  $('#modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') close(); };

  const rev = $('#revokeBtn');
  if (rev) rev.onclick = () => revokeLicense(license.id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

checkAuthAndLoad().catch(err => console.error(err));
</script>
</body>
</html>`;
