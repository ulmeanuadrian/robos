<script lang="ts">
  import { apiFetch } from '../lib/api-client';

  interface EnvEntry {
    key: string;
    value: string | null;
    masked: boolean;
    status: 'set' | 'unset' | 'placeholder';
    category: string;
    required_by: string[];
    optional_for: string[];
  }

  let activeTab = $state<'env' | 'mcp' | 'claude' | 'scripts'>('env');
  let envEntries = $state<EnvEntry[]>([]);
  let envWarnings = $state<string[]>([]);
  let editingKey = $state<string | null>(null);
  let editingValue = $state<string>('');
  let editingShow = $state<boolean>(false);
  let mcpConfig = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');
  let authError = $state<string | null>(null);

  async function fetchSettings() {
    loading = true;
    authError = null;
    try {
      if (activeTab === 'env') {
        const res = await apiFetch('/api/settings/env');
        if (res.status === 401 || res.status === 503) {
          authError = 'Auth not configured. Ruleaza: node scripts/setup-env.js, apoi reincarca.';
          envEntries = [];
        } else if (res.ok) {
          const data = await res.json();
          envEntries = data.entries || [];
          envWarnings = data.warnings || [];
        }
      } else if (activeTab === 'mcp') {
        const res = await apiFetch('/api/settings/mcp');
        if (res.ok) {
          const data = await res.json();
          mcpConfig = JSON.stringify(data, null, 2);
        }
      }
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function startEdit(entry: EnvEntry) {
    editingKey = entry.key;
    editingValue = entry.masked ? '' : (entry.value || '');
    editingShow = !entry.masked;
    saveMessage = '';
  }

  function cancelEdit() {
    editingKey = null;
    editingValue = '';
    editingShow = false;
  }

  async function saveOne() {
    if (!editingKey) return;
    saving = true;
    saveMessage = '';
    try {
      const res = await apiFetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: editingKey, value: editingValue }),
      });
      if (res.ok) {
        saveMessage = `${editingKey} salvat.`;
        cancelEdit();
        await fetchSettings();
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        saveMessage = `Eroare: ${err.error || res.statusText}`;
      }
    } catch (e) {
      saveMessage = `Eroare retea: ${(e as Error).message}`;
    } finally {
      saving = false;
    }
  }

  async function clearOne(entry: EnvEntry) {
    if (!confirm(`Sterg valoarea pentru ${entry.key}?`)) return;
    saving = true;
    try {
      const res = await apiFetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: entry.key, value: '' }),
      });
      if (res.ok) {
        saveMessage = `${entry.key} sters.`;
        await fetchSettings();
      }
    } finally {
      saving = false;
    }
  }

  async function saveMcp() {
    saving = true;
    saveMessage = '';
    try {
      const parsed = JSON.parse(mcpConfig);
      const res = await apiFetch('/api/settings/mcp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.ok) {
        saveMessage = 'MCP salvat.';
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        saveMessage = `Eroare: ${err.error || res.statusText}`;
      }
    } catch {
      saveMessage = 'JSON invalid.';
    } finally {
      saving = false;
    }
  }

  // Group entries by category for display
  const grouped = $derived.by(() => {
    const buckets = new Map<string, EnvEntry[]>();
    for (const e of envEntries) {
      const cat = e.category || 'general';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(e);
    }
    // Order: core, skills, distribution, general, anything else
    const ORDER = ['core', 'skills', 'distribution', 'general'];
    const sorted: { category: string; entries: EnvEntry[] }[] = [];
    for (const cat of ORDER) {
      if (buckets.has(cat)) sorted.push({ category: cat, entries: buckets.get(cat)! });
    }
    for (const [cat, entries] of buckets) {
      if (!ORDER.includes(cat)) sorted.push({ category: cat, entries });
    }
    return sorted;
  });

  const CATEGORY_LABELS: Record<string, string> = {
    core: 'Core (robOS porneste cu astea)',
    skills: 'Skills (chei API per skill)',
    distribution: 'Distribution (numai daca distribui robOS)',
    general: 'Altele',
  };

  $effect(() => {
    fetchSettings();
  });

  const tabs = [
    { id: 'env' as const, label: 'Environment' },
    { id: 'mcp' as const, label: 'MCP Config' },
    { id: 'claude' as const, label: 'Claude Config' },
    { id: 'scripts' as const, label: 'Scripts' },
  ];
</script>

<div class="settings-header">
  <h2>Settings</h2>
</div>

<div class="settings-tabs">
  {#each tabs as tab}
    <button
      class="tab-btn"
      class:active={activeTab === tab.id}
      onclick={() => { activeTab = tab.id; saveMessage = ''; cancelEdit(); }}
    >
      {tab.label}
    </button>
  {/each}
</div>

<div class="settings-body card">
  {#if loading}
    <div class="settings-loading">Loading...</div>
  {:else if activeTab === 'env'}
    <div class="env-section">
      <div class="section-intro">
        <p>Variabile de environment din <code>.env</code>. Sursa unica de adevar pentru chei API si secrete in robOS.</p>
        <p class="hint">Valorile secrete (API_KEY, TOKEN, SECRET, ...) nu sunt afisate niciodata. Apasa <strong>Set</strong> sa le suprascrii. Comentariile din <code>.env</code> sunt pastrate la salvare.</p>
      </div>

      {#if authError}
        <div class="auth-error">{authError}</div>
      {/if}

      {#each envWarnings as warning}
        <div class="auth-error">{warning}</div>
      {/each}

      {#if envEntries.length === 0 && !authError}
        <div class="settings-empty">
          <p>Niciun slot in <code>.env</code>.</p>
          <p class="hint">Ruleaza <code>node scripts/setup-env.js</code> ca sa-l populezi din <code>.env.example</code>.</p>
        </div>
      {:else}
        {#each grouped as group}
          <div class="env-group">
            <h3 class="env-group-title">{CATEGORY_LABELS[group.category] || group.category}</h3>
            <div class="env-list">
              {#each group.entries as entry (entry.key)}
                <div class="env-row">
                  <div class="env-key-col">
                    <label class="env-key">{entry.key}</label>
                    {#if entry.required_by && entry.required_by.length > 0}
                      <span class="env-meta">cerut de: {entry.required_by.join(', ')}</span>
                    {:else if entry.optional_for && entry.optional_for.length > 0}
                      <span class="env-meta env-meta-optional">optional pentru: {entry.optional_for.join(', ')}</span>
                    {/if}
                  </div>
                  <div class="env-value-col">
                    {#if editingKey === entry.key}
                      <input
                        type={editingShow ? 'text' : 'password'}
                        class="env-input"
                        bind:value={editingValue}
                        placeholder="(lasa gol pentru sterge)"
                      />
                      <button class="btn btn-ghost btn-sm" onclick={() => editingShow = !editingShow}>
                        {editingShow ? 'Hide' : 'Show'}
                      </button>
                      <button class="btn btn-primary btn-sm" onclick={saveOne} disabled={saving}>
                        {saving ? '...' : 'Salveaza'}
                      </button>
                      <button class="btn btn-ghost btn-sm" onclick={cancelEdit}>Anuleaza</button>
                    {:else}
                      <span class="env-status status-{entry.status}">
                        {#if entry.status === 'set'}
                          {entry.masked ? '••••• (set)' : entry.value}
                        {:else if entry.status === 'placeholder'}
                          {entry.value} (placeholder)
                        {:else}
                          (gol)
                        {/if}
                      </span>
                      <button class="btn btn-ghost btn-sm" onclick={() => startEdit(entry)}>
                        Set
                      </button>
                      {#if entry.status !== 'unset'}
                        <button class="btn btn-ghost btn-sm" onclick={() => clearOne(entry)}>
                          Clear
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}

        {#if saveMessage}
          <div class="save-msg">{saveMessage}</div>
        {/if}
      {/if}
    </div>

  {:else if activeTab === 'mcp'}
    <div class="mcp-section">
      <div class="section-intro">
        <p>MCP server configuration (<code>.mcp.json</code>).</p>
      </div>
      <textarea class="mcp-editor" bind:value={mcpConfig} rows="20" spellcheck="false"></textarea>
      <div class="save-row">
        <button class="btn btn-primary" onclick={saveMcp} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {#if saveMessage}
          <span class="save-msg">{saveMessage}</span>
        {/if}
      </div>
    </div>

  {:else if activeTab === 'claude'}
    <div class="claude-section">
      <div class="section-intro">
        <p>Claude Code configuration is managed through <code>CLAUDE.md</code> and <code>AGENTS.md</code>.</p>
      </div>
      <div class="config-files">
        <div class="config-file">
          <h4>CLAUDE.md</h4>
          <p>Session lifecycle, memory management, and general rules.</p>
          <a class="btn btn-secondary btn-sm" href="/files/?path=CLAUDE.md">
            View in Files
          </a>
        </div>
        <div class="config-file">
          <h4>AGENTS.md</h4>
          <p>Shared project rules, skill categories, and output standards.</p>
          <a class="btn btn-secondary btn-sm" href="/files/?path=AGENTS.md">
            View in Files
          </a>
        </div>
      </div>
    </div>

  {:else}
    <div class="scripts-section">
      <div class="section-intro">
        <p>Utility scripts in the <code>scripts/</code> directory.</p>
      </div>
      <div class="scripts-list">
        <div class="script-item">
          <div class="script-info">
            <h4>setup-env.js</h4>
            <p>Initializeaza/sincronizeaza .env din .env.example. Idempotent.</p>
          </div>
          <code class="script-cmd">node scripts/setup-env.js</code>
        </div>
        <div class="script-item">
          <div class="script-info">
            <h4>init-db.js</h4>
            <p>Initialize the Centre database.</p>
          </div>
          <code class="script-cmd">npm run init-db</code>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .settings-header {
    margin-bottom: var(--space-5);
  }

  .settings-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }

  .settings-tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .tab-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-muted);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-btn:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .tab-btn.active {
    color: var(--color-primary);
    background: var(--color-surface);
    border-color: var(--color-border);
    box-shadow: var(--shadow-sm);
  }

  .settings-body {
    padding: var(--space-6);
    min-height: 400px;
  }

  .settings-loading, .settings-empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-muted);
  }

  .hint {
    font-size: var(--text-sm);
    margin-top: var(--space-2);
    color: var(--color-muted);
  }

  .hint code {
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .section-intro {
    margin-bottom: var(--space-5);
  }

  .section-intro p {
    margin: 0 0 var(--space-2) 0;
    color: var(--color-text);
    font-size: var(--text-sm);
  }

  .section-intro code {
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .auth-error {
    padding: var(--space-3) var(--space-4);
    background: var(--color-warning-bg, #fef3c7);
    border: 1px solid var(--color-warning, #f59e0b);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
  }

  .env-group {
    margin-bottom: var(--space-6);
  }

  .env-group-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 var(--space-3) 0;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .env-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .env-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) 0;
  }

  .env-key-col {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .env-key {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .env-meta {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .env-meta-optional {
    font-style: italic;
  }

  .env-value-col {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .env-status {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    min-height: 1.6em;
  }

  .status-unset {
    color: var(--color-muted);
    font-style: italic;
  }

  .status-placeholder {
    color: var(--color-warning, #f59e0b);
  }

  .env-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    outline: none;
  }

  .env-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }

  .save-msg {
    font-size: var(--text-sm);
    color: var(--color-text);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg);
    border-radius: var(--radius-md);
    margin-top: var(--space-4);
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .mcp-editor {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: var(--leading-relaxed);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    resize: vertical;
    outline: none;
    margin-bottom: var(--space-4);
  }

  .mcp-editor:focus {
    border-color: var(--color-primary);
  }

  .config-files {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .config-file {
    padding: var(--space-4);
    background: var(--color-bg);
    border-radius: var(--radius-lg);
  }

  .config-file h4 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .config-file p {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .scripts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .script-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: var(--color-bg);
    border-radius: var(--radius-lg);
  }

  .script-info h4 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .script-info p {
    margin: var(--space-1) 0 0 0;
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .script-cmd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: var(--color-surface);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }
</style>
