<script lang="ts">
  type AuditEntry = {
    audit_at?: string;
    detected_at?: string;
    aggregated_at?: string;
    verdict?: string;
    files_audited?: number;
    abandoned?: any[];
    ok?: any;
    window_days?: number;
    rule_candidates?: number;
    skills_with_activity?: number;
  };

  type ConnectionResult = Record<string, string>;

  type MemoryFile = {
    date: string;
    bytes: number;
    sessionCount: number;
    closed: boolean;
    mtime: string;
  };

  let activeSection = $state<'audits' | 'memory' | 'learnings' | 'connections'>('audits');

  // Audit history
  let audits = $state<{ startup: AuditEntry[]; session_timeouts: AuditEntry[]; learnings_reviews: AuditEntry[] }>({
    startup: [],
    session_timeouts: [],
    learnings_reviews: [],
  });
  let auditsLoading = $state(true);

  // Memory editor
  let memoryFiles = $state<MemoryFile[]>([]);
  let selectedDate = $state<string | null>(null);
  let memoryContent = $state('');
  let memoryDirty = $state(false);
  let memoryLoading = $state(false);
  let memorySaving = $state(false);
  let memoryMessage = $state('');

  // Learnings
  let learningsData = $state<{ content: string; sections: string[]; bytes: number }>({
    content: '', sections: [], bytes: 0,
  });
  let learningsLoading = $state(true);

  // Connection health
  let connHealth = $state<{ checked_at: string; results: ConnectionResult } | null>(null);
  let connLoading = $state(false);

  async function loadAudits() {
    auditsLoading = true;
    try {
      const res = await fetch('/api/system/audit-history');
      if (res.ok) audits = await res.json();
    } finally {
      auditsLoading = false;
    }
  }

  async function loadMemoryList() {
    try {
      const res = await fetch('/api/system/memory');
      if (res.ok) memoryFiles = await res.json();
    } catch {}
  }

  async function loadMemoryFile(date: string) {
    memoryLoading = true;
    memoryMessage = '';
    try {
      const res = await fetch(`/api/system/memory/${date}`);
      if (res.ok) {
        const data = await res.json();
        memoryContent = data.content;
        selectedDate = date;
        memoryDirty = false;
      }
    } finally {
      memoryLoading = false;
    }
  }

  async function saveMemory() {
    if (!selectedDate || !memoryDirty) return;
    memorySaving = true;
    memoryMessage = '';
    try {
      const res = await fetch(`/api/system/memory/${selectedDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: memoryContent }),
      });
      if (res.ok) {
        memoryDirty = false;
        memoryMessage = `Salvat ${selectedDate}.md (${memoryContent.length} bytes)`;
        await loadMemoryList();
      } else {
        const err = await res.json();
        memoryMessage = `Eroare: ${err.error || res.statusText}`;
      }
    } finally {
      memorySaving = false;
    }
  }

  async function loadLearnings() {
    learningsLoading = true;
    try {
      const res = await fetch('/api/system/learnings');
      if (res.ok) learningsData = await res.json();
    } finally {
      learningsLoading = false;
    }
  }

  async function checkConnections() {
    connLoading = true;
    try {
      const res = await fetch('/api/system/connections-health');
      if (res.ok) connHealth = await res.json();
    } finally {
      connLoading = false;
    }
  }

  function selectSection(s: typeof activeSection) {
    activeSection = s;
    if (s === 'audits' && audits.startup.length === 0) loadAudits();
    if (s === 'memory' && memoryFiles.length === 0) loadMemoryList();
    if (s === 'learnings' && !learningsData.content) loadLearnings();
    if (s === 'connections' && !connHealth) checkConnections();
  }

  function statusDotClass(status: string): string {
    if (status === 'ok' || status === 'ALL_CLEAN' || status === 'ALL_ACTIVE') return 'dot-ok';
    if (status === 'unset' || status === 'NO_DATA') return 'dot-unknown';
    if (status === 'error' || status === 'ABANDONED_FOUND' || status === 'TIMEOUT_DETECTED') return 'dot-error';
    return 'dot-warning';
  }

  $effect(() => {
    loadAudits();
  });
</script>

<div class="system-panel">
  <nav class="section-nav">
    <button class="nav-btn" class:active={activeSection === 'audits'} onclick={() => selectSection('audits')}>
      Audituri
    </button>
    <button class="nav-btn" class:active={activeSection === 'memory'} onclick={() => selectSection('memory')}>
      Memorie
    </button>
    <button class="nav-btn" class:active={activeSection === 'learnings'} onclick={() => selectSection('learnings')}>
      Learnings
    </button>
    <button class="nav-btn" class:active={activeSection === 'connections'} onclick={() => selectSection('connections')}>
      Conexiuni
    </button>
  </nav>

  {#if activeSection === 'audits'}
    <div class="card section-card">
      <h3>Audit history</h3>
      {#if auditsLoading}
        <p class="muted">Se incarca...</p>
      {:else}
        <div class="audit-grid">
          <div>
            <h4>Startup audits ({audits.startup.length})</h4>
            <table class="data-table">
              <thead><tr><th>Cand</th><th>Verdict</th><th>Auditat</th><th>Abandonat</th></tr></thead>
              <tbody>
                {#each audits.startup.slice(0, 20) as a}
                  <tr>
                    <td>{(a.audit_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td><span class="status-dot {statusDotClass(a.verdict || '')}"></span> {a.verdict}</td>
                    <td>{a.files_audited ?? '-'}</td>
                    <td>{Array.isArray(a.abandoned) ? a.abandoned.length : '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div>
            <h4>Session timeouts ({audits.session_timeouts.length})</h4>
            <table class="data-table">
              <thead><tr><th>Cand</th><th>Verdict</th><th>Abandonat</th></tr></thead>
              <tbody>
                {#each audits.session_timeouts.slice(0, 20) as a}
                  <tr>
                    <td>{(a.detected_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td><span class="status-dot {statusDotClass(a.verdict || '')}"></span> {a.verdict}</td>
                    <td>{Array.isArray(a.abandoned) ? a.abandoned.length : '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div>
            <h4>Learnings reviews ({audits.learnings_reviews.length})</h4>
            <table class="data-table">
              <thead><tr><th>Cand</th><th>Skills</th><th>Candidates</th></tr></thead>
              <tbody>
                {#each audits.learnings_reviews.slice(0, 10) as a}
                  <tr>
                    <td>{(a.aggregated_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td>{a.skills_with_activity ?? '-'}</td>
                    <td>{a.rule_candidates ?? '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if activeSection === 'memory'}
    <div class="card section-card">
      <h3>Memory editor</h3>
      <div class="memory-grid">
        <div class="memory-list">
          {#each memoryFiles as f}
            <button class="memory-item" class:active={selectedDate === f.date} onclick={() => loadMemoryFile(f.date)}>
              <span class="memory-date">{f.date}</span>
              <span class="memory-meta">
                <span class="status-dot {f.closed ? 'dot-ok' : 'dot-warning'}"></span>
                {f.sessionCount} sess, {Math.round(f.bytes / 1024)}KB
              </span>
            </button>
          {/each}
        </div>
        <div class="memory-editor">
          {#if !selectedDate}
            <p class="muted">Selecteaza un fisier de memorie pentru editare</p>
          {:else}
            <div class="editor-toolbar">
              <strong>{selectedDate}.md</strong>
              <button class="btn-primary" onclick={saveMemory} disabled={!memoryDirty || memorySaving}>
                {memorySaving ? 'Se salveaza...' : 'Salveaza'}
              </button>
              {#if memoryMessage}<span class="message">{memoryMessage}</span>{/if}
            </div>
            {#if memoryLoading}
              <p class="muted">Se incarca...</p>
            {:else}
              <textarea
                class="memory-textarea"
                bind:value={memoryContent}
                oninput={() => memoryDirty = true}
              ></textarea>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if activeSection === 'learnings'}
    <div class="card section-card">
      <h3>Learnings ({learningsData.sections.length} skills, {Math.round(learningsData.bytes / 1024)}KB)</h3>
      {#if learningsLoading}
        <p class="muted">Se incarca...</p>
      {:else}
        <div class="learnings-content">
          <pre>{learningsData.content}</pre>
        </div>
      {/if}
    </div>
  {/if}

  {#if activeSection === 'connections'}
    <div class="card section-card">
      <h3>Connection health</h3>
      <div class="conn-toolbar">
        <button class="btn-primary" onclick={checkConnections} disabled={connLoading}>
          {connLoading ? 'Se verifica...' : 'Verifica acum'}
        </button>
        {#if connHealth}
          <span class="muted">Ultimul check: {(connHealth.checked_at || '').slice(0, 16).replace('T', ' ')}</span>
        {/if}
      </div>
      {#if connHealth}
        <table class="data-table">
          <thead><tr><th>Conexiune</th><th>Status</th></tr></thead>
          <tbody>
            {#each Object.entries(connHealth.results) as [name, status]}
              <tr>
                <td>{name}</td>
                <td><span class="status-dot {statusDotClass(status)}"></span> {status}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .system-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section-nav {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .nav-btn {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .nav-btn:hover { background: var(--color-surface-hover); }
  .nav-btn.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }

  .section-card {
    padding: var(--space-5);
  }

  .section-card h3 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-lg);
  }

  .audit-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-5);
  }

  .audit-grid h4 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-muted);
    font-weight: 500;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .data-table th, .data-table td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }

  .data-table th {
    color: var(--color-muted);
    font-weight: 500;
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: var(--space-1);
    vertical-align: middle;
  }

  .dot-ok { background: var(--color-success); }
  .dot-warning { background: var(--color-warning); }
  .dot-error { background: var(--color-error); }
  .dot-unknown { background: var(--color-border); }

  .memory-grid {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: var(--space-4);
    min-height: 400px;
  }

  .memory-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 600px;
    overflow-y: auto;
  }

  .memory-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .memory-item:hover { background: var(--color-surface-hover); }
  .memory-item.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }

  .memory-date {
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .memory-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-muted);
    font-size: var(--text-xs);
  }

  .memory-item.active .memory-meta { color: rgba(255,255,255,0.8); }

  .memory-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .memory-textarea {
    flex: 1;
    min-height: 500px;
    padding: var(--space-3);
    font-family: ui-monospace, monospace;
    font-size: var(--text-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    resize: vertical;
  }

  .btn-primary {
    padding: var(--space-2) var(--space-4);
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .learnings-content pre {
    max-height: 600px;
    overflow: auto;
    background: var(--color-surface);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    white-space: pre-wrap;
  }

  .conn-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .muted { color: var(--color-muted); }
  .message { color: var(--color-success); font-size: var(--text-sm); }
</style>
