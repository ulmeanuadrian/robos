<script lang="ts">
  interface EnvVar {
    key: string;
    value: string;
    masked: boolean;
  }

  let activeTab = $state<'env' | 'mcp' | 'claude' | 'scripts'>('env');
  let envVars = $state<EnvVar[]>([]);
  let mcpConfig = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let saveMessage = $state('');

  async function fetchSettings() {
    loading = true;
    try {
      if (activeTab === 'env') {
        const res = await fetch('/api/settings/env');
        if (res.ok) {
          envVars = await res.json();
        }
      } else if (activeTab === 'mcp') {
        const res = await fetch('/api/settings/mcp');
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

  async function saveEnv() {
    saving = true;
    saveMessage = '';
    try {
      const res = await fetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envVars),
      });
      saveMessage = res.ok ? 'Saved successfully.' : 'Failed to save.';
    } catch {
      saveMessage = 'Error saving settings.';
    } finally {
      saving = false;
    }
  }

  async function saveMcp() {
    saving = true;
    saveMessage = '';
    try {
      const parsed = JSON.parse(mcpConfig);
      const res = await fetch('/api/settings/mcp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      saveMessage = res.ok ? 'Saved successfully.' : 'Failed to save.';
    } catch {
      saveMessage = 'Invalid JSON format.';
    } finally {
      saving = false;
    }
  }

  function toggleMask(index: number) {
    envVars[index].masked = !envVars[index].masked;
  }

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
      onclick={() => { activeTab = tab.id; saveMessage = ''; }}
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
        <p>Environment variables from your workspace <code>.env</code> file.</p>
      </div>
      {#if envVars.length === 0}
        <div class="settings-empty">
          <p>No .env file found or it is empty.</p>
          <p class="hint">Create a <code>.env</code> file in your workspace root to configure environment variables.</p>
        </div>
      {:else}
        <div class="env-list">
          {#each envVars as envVar, i}
            <div class="env-row">
              <label class="env-key">{envVar.key}</label>
              <div class="env-value-wrapper">
                <input
                  type={envVar.masked ? 'password' : 'text'}
                  class="env-input"
                  bind:value={envVar.value}
                />
                <button class="btn btn-ghost btn-sm" onclick={() => toggleMask(i)}>
                  {envVar.masked ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>
          {/each}
        </div>
        <div class="save-row">
          <button class="btn btn-primary" onclick={saveEnv} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {#if saveMessage}
            <span class="save-msg">{saveMessage}</span>
          {/if}
        </div>
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
          <button class="btn btn-secondary btn-sm" onclick={() => { /* Would navigate to file browser */ }}>
            View in Files
          </button>
        </div>
        <div class="config-file">
          <h4>AGENTS.md</h4>
          <p>Shared project rules, skill categories, and output standards.</p>
          <button class="btn btn-secondary btn-sm" onclick={() => { /* Would navigate to file browser */ }}>
            View in Files
          </button>
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
            <h4>init-db.js</h4>
            <p>Initialize the Centre database.</p>
          </div>
          <code class="script-cmd">npm run init-db</code>
        </div>
        <div class="script-item">
          <div class="script-info">
            <h4>Setup Wizard</h4>
            <p>Run the RobOS setup process.</p>
          </div>
          <code class="script-cmd">bash scripts/setup.sh</code>
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
    margin: 0;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .section-intro code {
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .env-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .env-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .env-key {
    width: 200px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    flex-shrink: 0;
  }

  .env-value-wrapper {
    flex: 1;
    display: flex;
    gap: var(--space-2);
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

  .save-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .save-msg {
    font-size: var(--text-sm);
    color: var(--color-success);
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
