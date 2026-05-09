<script lang="ts">
  import { apiFetch } from '../lib/api-client';

  interface CronJob {
    slug: string;
    name: string;
    schedule: string;
    days: string;
    model: string;
    prompt: string;
    active: number;
    timeout: string;
    retries: number;
    notify: string;
    clientId: string | null;
    createdAt: string;
    lastRun: CronRun | null;
  }

  interface CronRun {
    id: number;
    result: string;
    startedAt: string;
    completedAt: string | null;
    durationSec: number | null;
    trigger: string;
  }

  interface JobFormData {
    slug: string;
    name: string;
    schedule: string;
    prompt: string;
    model: string;
    timeout: string;
    retries: number;
    active: boolean;
    clientId: string;
  }

  let jobs = $state<CronJob[]>([]);
  let loading = $state(true);
  let expandedJob = $state<string | null>(null);
  let jobHistory = $state<Record<string, CronRun[]>>({});

  // Modale
  let showAddModal = $state(false);
  let showEditModal = $state(false);
  let showDeleteConfirm = $state<string | null>(null);
  let showLogModal = $state<{ slug: string; runId: number } | null>(null);
  let logContent = $state<{ log: string; truncated?: boolean; missing?: boolean } | null>(null);
  let formError = $state<string | null>(null);
  let saving = $state(false);

  let formData = $state<JobFormData>(emptyForm());
  let editingSlug = $state<string | null>(null);

  // Toast
  let toast = $state<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  function emptyForm(): JobFormData {
    return {
      slug: '',
      name: '',
      schedule: '0 9 * * 1-5',
      prompt: '',
      model: 'sonnet',
      timeout: '30m',
      retries: 0,
      active: true,
      clientId: '',
    };
  }

  function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
    toast = { msg, kind };
    setTimeout(() => { toast = null; }, 4000);
  }

  async function fetchJobs() {
    try {
      const res = await apiFetch('/api/cron');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      jobs = await res.json();
    } catch {
      jobs = [];
    } finally {
      loading = false;
    }
  }

  async function fetchHistory(slug: string) {
    try {
      const res = await apiFetch(`/api/cron/${slug}/history`);
      if (res.ok) jobHistory[slug] = await res.json();
    } catch { /* ignore */ }
  }

  async function toggleJob(slug: string, active: boolean) {
    try {
      const res = await apiFetch(`/api/cron/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: active ? 1 : 0 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const job = jobs.find(j => j.slug === slug);
      if (job) job.active = active ? 1 : 0;
      showToast(`Job ${active ? 'activat' : 'pus pe pauza'}`);
    } catch (e: any) {
      showToast('Eroare: ' + (e?.message || 'unknown'), 'err');
    }
  }

  async function triggerRun(slug: string) {
    try {
      const res = await apiFetch(`/api/cron/${slug}/run`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      showToast(`Job lansat: ${slug}`);
      // refresh history pe expand
      if (expandedJob === slug) fetchHistory(slug);
    } catch (e: any) {
      showToast('Lansare esuata: ' + (e?.message || 'unknown'), 'err');
    }
  }

  function openAddModal() {
    formData = emptyForm();
    formError = null;
    showAddModal = true;
  }

  function openEditModal(job: CronJob) {
    formData = {
      slug: job.slug,
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt || '',
      model: job.model || 'sonnet',
      timeout: job.timeout || '30m',
      retries: job.retries || 0,
      active: !!job.active,
      clientId: job.clientId || '',
    };
    editingSlug = job.slug;
    formError = null;
    showEditModal = true;
  }

  async function submitNewJob() {
    formError = null;
    saving = true;
    try {
      const payload = { ...formData, active: formData.active ? 1 : 0, clientId: formData.clientId || null };
      const res = await apiFetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showAddModal = false;
      showToast(`Job creat: ${formData.slug}`);
      await fetchJobs();
    } catch (e: any) {
      formError = e?.message || 'Eroare necunoscuta';
    } finally {
      saving = false;
    }
  }

  async function submitEditJob() {
    formError = null;
    saving = true;
    try {
      // Nu trimitem slug-ul (e PK, nu se schimba)
      const { slug, ...payload } = formData;
      const body = { ...payload, active: formData.active ? 1 : 0, clientId: formData.clientId || null };
      const res = await apiFetch(`/api/cron/${editingSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showEditModal = false;
      showToast(`Job actualizat: ${editingSlug}`);
      await fetchJobs();
    } catch (e: any) {
      formError = e?.message || 'Eroare necunoscuta';
    } finally {
      saving = false;
    }
  }

  async function confirmDelete(slug: string) {
    try {
      const res = await apiFetch(`/api/cron/${slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showDeleteConfirm = null;
      showToast(`Job sters: ${slug}`);
      await fetchJobs();
    } catch (e: any) {
      showToast('Stergere esuata: ' + (e?.message || 'unknown'), 'err');
    }
  }

  async function viewLog(slug: string, runId: number) {
    showLogModal = { slug, runId };
    logContent = null;
    try {
      const res = await apiFetch(`/api/cron/${slug}/runs/${runId}/log`);
      if (!res.ok) throw new Error(await res.text());
      logContent = await res.json();
    } catch (e: any) {
      logContent = { log: 'Eroare la citire: ' + (e?.message || 'unknown') };
    }
  }

  function toggleExpand(slug: string) {
    if (expandedJob === slug) {
      expandedJob = null;
    } else {
      expandedJob = slug;
      if (!jobHistory[slug]) fetchHistory(slug);
    }
  }

  // SSE listener pentru notificari live
  function setupSse() {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events');
    es.addEventListener('cron:run:started', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        showToast(`Pornit: ${data.slug} (${data.trigger})`);
      } catch { /* ignore */ }
    });
    es.addEventListener('cron:run:completed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const kind = data.result === 'success' ? 'ok' : 'err';
        showToast(`Terminat: ${data.slug} — ${data.result}`, kind);
        fetchJobs(); // refresh listing
        if (expandedJob === data.slug) fetchHistory(data.slug);
      } catch { /* ignore */ }
    });
    return () => es.close();
  }

  $effect(() => {
    fetchJobs();
    return setupSse();
  });

  function resultBadge(result: string): string {
    switch (result) {
      case 'success': return 'badge-success';
      case 'failure': return 'badge-error';
      case 'timeout': return 'badge-warning';
      case 'running': return 'badge-primary';
      default: return 'badge-muted';
    }
  }

  function formatDuration(sec: number | null): string {
    if (sec == null) return '--';
    if (sec < 60) return `${Math.round(sec)}s`;
    const mins = Math.floor(sec / 60);
    return `${mins}m ${Math.round(sec % 60)}s`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="cron-header">
  <h2>Cron</h2>
  <div class="cron-header-actions">
    <button class="btn btn-primary btn-sm" onclick={openAddModal}>+ Job nou</button>
    <button class="btn btn-ghost btn-sm" onclick={fetchJobs}>Refresh</button>
  </div>
</div>

{#if loading}
  <div class="cron-loading">Incarc joburile...</div>
{:else if jobs.length === 0}
  <div class="cron-empty card">
    <p>Niciun job configurat.</p>
    <p class="cron-hint">Apasa <strong>+ Job nou</strong> sau pune un fisier JSON in <code>cron/jobs/</code>.</p>
  </div>
{:else}
  <div class="cron-list">
    {#each jobs as job}
      <div class="cron-card card">
        <div class="cron-card-main">
          <div class="cron-info">
            <div class="cron-name-row">
              <span class="cron-status-dot" class:active={!!job.active} class:paused={!job.active}></span>
              <h3>{job.name}</h3>
              <span class="badge badge-muted">{job.model}</span>
              {#if job.clientId}
                <span class="badge badge-muted">client: {job.clientId}</span>
              {/if}
            </div>
            <div class="cron-schedule">
              <code>{job.schedule}</code>
              <span class="cron-timeout">timeout: {job.timeout}</span>
              {#if job.retries > 0}
                <span class="cron-retries">retries: {job.retries}</span>
              {/if}
            </div>
          </div>
          <div class="cron-last-run">
            {#if job.lastRun}
              <span class="badge {resultBadge(job.lastRun.result)}">{job.lastRun.result}</span>
              <span class="cron-duration">{formatDuration(job.lastRun.durationSec)}</span>
            {:else}
              <span class="cron-no-runs">Niciodata</span>
            {/if}
          </div>
          <div class="cron-actions">
            <button class="btn btn-secondary btn-sm" onclick={() => triggerRun(job.slug)}>Run Now</button>
            <button class="btn btn-ghost btn-sm" onclick={() => toggleJob(job.slug, !job.active)}>
              {job.active ? 'Pauza' : 'Reia'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick={() => openEditModal(job)}>Edit</button>
            <button class="btn btn-ghost btn-sm" onclick={() => toggleExpand(job.slug)}>
              {expandedJob === job.slug ? 'Ascunde' : 'Istoric'}
            </button>
            <button class="btn btn-danger btn-sm" onclick={() => showDeleteConfirm = job.slug}>Sterge</button>
          </div>
        </div>

        {#if expandedJob === job.slug}
          <div class="cron-history">
            <h4>Istoric rulari</h4>
            {#if !jobHistory[job.slug]}
              <p class="history-empty">Incarc...</p>
            {:else if jobHistory[job.slug].length === 0}
              <p class="history-empty">Nicio rulare inregistrata.</p>
            {:else}
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Inceput</th>
                    <th>Rezultat</th>
                    <th>Durata</th>
                    <th>Trigger</th>
                    <th>Log</th>
                  </tr>
                </thead>
                <tbody>
                  {#each jobHistory[job.slug] as run}
                    <tr>
                      <td>{formatDate(run.startedAt)}</td>
                      <td><span class="badge {resultBadge(run.result)}">{run.result}</span></td>
                      <td>{formatDuration(run.durationSec)}</td>
                      <td><span class="badge badge-muted">{run.trigger}</span></td>
                      <td>
                        <button class="btn btn-ghost btn-xs" onclick={() => viewLog(job.slug, run.id)}>Vezi</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- ADD MODAL -->
{#if showAddModal}
  <div class="modal-overlay" onclick={() => showAddModal = false}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>Job nou</h3>
      <div class="form">
        <label>
          <span>Slug (lowercase, liniute)</span>
          <input bind:value={formData.slug} placeholder="daily-blog-post" />
        </label>
        <label>
          <span>Nume afisat</span>
          <input bind:value={formData.name} placeholder="Daily Blog Post" />
        </label>
        <label>
          <span>Schedule (cron syntax)</span>
          <input bind:value={formData.schedule} placeholder="0 9 * * 1-5" />
          <small>Exemple: <code>0 9 * * 1-5</code> (zile lucratoare 9am), <code>*/15 * * * *</code> (la 15min)</small>
        </label>
        <label>
          <span>Prompt (ce face Claude la fiecare rulare)</span>
          <textarea bind:value={formData.prompt} rows="4" placeholder="Run skill content-blog-post with topic: 'AI automation trends'"></textarea>
        </label>
        <div class="form-row">
          <label>
            <span>Model</span>
            <select bind:value={formData.model}>
              <option value="haiku">haiku (rapid, ieftin)</option>
              <option value="sonnet">sonnet (default)</option>
              <option value="opus">opus (calitate maxima)</option>
            </select>
          </label>
          <label>
            <span>Timeout</span>
            <input bind:value={formData.timeout} placeholder="30m" />
          </label>
          <label>
            <span>Retries (0-5)</span>
            <input type="number" min="0" max="5" bind:value={formData.retries} />
          </label>
        </div>
        <label>
          <span>Client ID (optional)</span>
          <input bind:value={formData.clientId} placeholder="acme-corp (rulează in clients/acme-corp/)" />
        </label>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={formData.active} />
          <span>Activ (porneste imediat)</span>
        </label>
        {#if formError}
          <div class="form-error">{formError}</div>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick={() => showAddModal = false} disabled={saving}>Anuleaza</button>
        <button class="btn btn-primary" onclick={submitNewJob} disabled={saving}>
          {saving ? 'Salvez...' : 'Creeaza'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- EDIT MODAL -->
{#if showEditModal}
  <div class="modal-overlay" onclick={() => showEditModal = false}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>Editare: {editingSlug}</h3>
      <div class="form">
        <label>
          <span>Nume afisat</span>
          <input bind:value={formData.name} />
        </label>
        <label>
          <span>Schedule</span>
          <input bind:value={formData.schedule} />
        </label>
        <label>
          <span>Prompt</span>
          <textarea bind:value={formData.prompt} rows="4"></textarea>
        </label>
        <div class="form-row">
          <label>
            <span>Model</span>
            <select bind:value={formData.model}>
              <option value="haiku">haiku</option>
              <option value="sonnet">sonnet</option>
              <option value="opus">opus</option>
            </select>
          </label>
          <label>
            <span>Timeout</span>
            <input bind:value={formData.timeout} />
          </label>
          <label>
            <span>Retries</span>
            <input type="number" min="0" max="5" bind:value={formData.retries} />
          </label>
        </div>
        <label>
          <span>Client ID</span>
          <input bind:value={formData.clientId} />
        </label>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={formData.active} />
          <span>Activ</span>
        </label>
        {#if formError}
          <div class="form-error">{formError}</div>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick={() => showEditModal = false} disabled={saving}>Anuleaza</button>
        <button class="btn btn-primary" onclick={submitEditJob} disabled={saving}>
          {saving ? 'Salvez...' : 'Salveaza'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- DELETE CONFIRM -->
{#if showDeleteConfirm}
  <div class="modal-overlay" onclick={() => showDeleteConfirm = null}>
    <div class="modal modal-sm" onclick={(e) => e.stopPropagation()}>
      <h3>Sigur stergi "{showDeleteConfirm}"?</h3>
      <p>Vor fi sterse si toate rularile din istoric.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick={() => showDeleteConfirm = null}>Anuleaza</button>
        <button class="btn btn-danger" onclick={() => confirmDelete(showDeleteConfirm!)}>Sterge</button>
      </div>
    </div>
  </div>
{/if}

<!-- LOG MODAL -->
{#if showLogModal}
  <div class="modal-overlay" onclick={() => showLogModal = null}>
    <div class="modal modal-lg" onclick={(e) => e.stopPropagation()}>
      <h3>Log: {showLogModal.slug} run #{showLogModal.runId}</h3>
      {#if logContent === null}
        <p>Incarc...</p>
      {:else}
        {#if logContent.missing}
          <p class="form-error">Fisierul de log nu mai exista.</p>
        {:else if logContent.truncated}
          <p class="hint">(Truncate la ultimele 200KB — fisierul are mai mult)</p>
        {/if}
        <pre class="log-content">{logContent.log}</pre>
      {/if}
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick={() => showLogModal = null}>Inchide</button>
      </div>
    </div>
  </div>
{/if}

<!-- TOAST -->
{#if toast}
  <div class="toast" class:toast-err={toast.kind === 'err'}>
    {toast.msg}
  </div>
{/if}

<style>
  .cron-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .cron-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }

  .cron-header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .cron-loading, .cron-empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-muted);
  }

  .cron-hint {
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }

  .cron-hint code {
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .cron-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .cron-card {
    overflow: hidden;
  }

  .cron-card-main {
    display: flex;
    align-items: center;
    padding: var(--space-4) var(--space-5);
    gap: var(--space-4);
  }

  .cron-info {
    flex: 1;
    min-width: 0;
  }

  .cron-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .cron-name-row h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .cron-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cron-status-dot.active { background: var(--color-success); }
  .cron-status-dot.paused { background: var(--color-muted); }

  .cron-schedule {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-muted);
    flex-wrap: wrap;
  }

  .cron-schedule code {
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .cron-last-run {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-width: 80px;
  }

  .cron-duration {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .cron-no-runs {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .cron-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .cron-history {
    border-top: 1px solid var(--color-border);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg);
  }

  .cron-history h4 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .history-empty {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .history-table th {
    text-align: left;
    padding: var(--space-2);
    color: var(--color-muted);
    font-weight: 500;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
  }

  .history-table td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  /* Modale */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .modal {
    background: var(--color-bg-elevated, var(--color-bg));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-5);
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-sm { max-width: 400px; }
  .modal-lg { max-width: 900px; }

  .modal h3 {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .form label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .form label > span {
    color: var(--color-muted);
    font-weight: 500;
  }

  .form input, .form select, .form textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: inherit;
  }

  .form textarea {
    font-family: var(--font-mono, monospace);
    resize: vertical;
  }

  .form small {
    font-size: var(--text-xs);
    color: var(--color-muted);
    margin-top: var(--space-1);
  }

  .form small code {
    background: var(--color-bg);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-3);
  }

  .checkbox-row {
    flex-direction: row !important;
    align-items: center;
    gap: var(--space-2) !important;
  }

  .form-error {
    padding: var(--space-2) var(--space-3);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    color: rgb(239, 68, 68);
    font-size: var(--text-sm);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .log-content {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    max-height: 60vh;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--color-muted);
    margin-bottom: var(--space-2);
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: var(--space-5);
    right: var(--space-5);
    padding: var(--space-3) var(--space-4);
    background: var(--color-success, #16a34a);
    color: white;
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    z-index: 200;
    animation: slide-in 0.2s ease-out;
    font-size: var(--text-sm);
    max-width: 400px;
  }

  .toast-err {
    background: rgb(239, 68, 68);
  }

  @keyframes slide-in {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .btn-danger {
    background: rgb(239, 68, 68);
    color: white;
    border: 1px solid rgb(239, 68, 68);
  }

  .btn-danger:hover {
    background: rgb(220, 38, 38);
  }

  .btn-xs {
    padding: 2px 8px;
    font-size: var(--text-xs);
  }

  .cron-retries {
    font-size: var(--text-xs);
  }
</style>
