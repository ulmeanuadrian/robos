<script lang="ts">
  interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    model: string | null;
    tag: string | null;
    level: number;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    claudeSessionId: string | null;
    needsInput: number;
  }

  interface TaskLog {
    id: string;
    type: string;
    content: string;
    toolName: string | null;
    createdAt: string;
  }

  interface Props {
    task: Task;
    onclose: () => void;
    onupdate?: (id: string, changes: Partial<Task>) => void;
  }

  let { task, onclose }: Props = $props();

  let activeTab = $state<'summary' | 'logs' | 'files'>('summary');
  let logs = $state<TaskLog[]>([]);
  let logsLoading = $state(false);
  let replyText = $state('');

  async function fetchLogs() {
    logsLoading = true;
    try {
      const res = await fetch(`/api/tasks/${task.id}`);
      if (res.ok) {
        const data = await res.json();
        logs = data.logs ?? [];
      }
    } catch {
      // ignore
    } finally {
      logsLoading = false;
    }
  }

  async function updateStatus(newStatus: string) {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const changes: Partial<Task> = { status: newStatus };
        if (newStatus === 'done') changes.completedAt = new Date().toISOString();
        onupdate?.(task.id, changes);
      }
    } catch {
      // ignore
    }
  }

  $effect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="panel-overlay" role="dialog" aria-modal="true">
  <button class="panel-backdrop" onclick={onclose} aria-label="Close panel"></button>
  <div class="panel-slide">
    <div class="panel-header">
      <div class="panel-title-row">
        <h2>{task.title}</h2>
        <button class="btn btn-ghost btn-sm" onclick={onclose}>
          &#10005;
        </button>
      </div>
      <div class="panel-meta">
        <span class="badge badge-{task.status === 'active' ? 'primary' : task.status === 'review' ? 'warning' : task.status === 'done' ? 'success' : 'muted'}">
          {task.status}
        </span>
        {#if task.model}
          <span class="badge badge-muted">{task.model}</span>
        {/if}
        {#if task.tag}
          <span class="badge badge-primary">{task.tag}</span>
        {/if}
        <span class="panel-date">Created {formatDate(task.createdAt)}</span>
      </div>
    </div>

    <div class="panel-tabs">
      <button
        class="tab-btn"
        class:active={activeTab === 'summary'}
        onclick={() => activeTab = 'summary'}
      >Summary</button>
      <button
        class="tab-btn"
        class:active={activeTab === 'logs'}
        onclick={() => activeTab = 'logs'}
      >Logs</button>
      <button
        class="tab-btn"
        class:active={activeTab === 'files'}
        onclick={() => activeTab = 'files'}
      >Files</button>
    </div>

    <div class="panel-body">
      {#if activeTab === 'summary'}
        <div class="summary-section">
          <h4>Description</h4>
          <p>{task.description || 'No description provided.'}</p>
        </div>
        <div class="summary-section">
          <h4>Details</h4>
          <dl class="detail-list">
            <dt>Level</dt>
            <dd>L{task.level}</dd>
            <dt>Session</dt>
            <dd>{task.claudeSessionId || 'None'}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(task.updatedAt)}</dd>
            {#if task.completedAt}
              <dt>Completed</dt>
              <dd>{formatDate(task.completedAt)}</dd>
            {/if}
          </dl>
        </div>

      {:else if activeTab === 'logs'}
        {#if logsLoading}
          <p class="tab-empty">Loading logs...</p>
        {:else if logs.length === 0}
          <p class="tab-empty">No logs recorded for this task.</p>
        {:else}
          <div class="logs-list">
            {#each logs as log}
              <div class="log-entry">
                <span class="log-type badge badge-muted">{log.type}</span>
                <span class="log-time">{formatDate(log.createdAt)}</span>
                <pre class="log-content">{log.content}</pre>
                {#if log.toolName}
                  <span class="log-tool">Tool: {log.toolName}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      {:else}
        <p class="tab-empty">File tracking will appear here when task produces output files.</p>
      {/if}
    </div>

    <div class="panel-footer">
      {#if task.needsInput}
        <div class="reply-bar">
          <input
            type="text"
            class="reply-input"
            placeholder="Reply to task..."
            bind:value={replyText}
          />
          <button class="btn btn-primary btn-sm">Send</button>
        </div>
      {/if}
      <div class="action-bar">
        {#if task.status === 'active'}
          <button class="btn btn-secondary btn-sm" onclick={() => updateStatus('review')}>
            Mark for Review
          </button>
        {/if}
        {#if task.status === 'review'}
          <button class="btn btn-primary btn-sm" onclick={() => updateStatus('done')}>
            Complete
          </button>
        {/if}
        {#if task.status !== 'cancelled' && task.status !== 'done'}
          <button class="btn btn-ghost btn-sm" onclick={() => updateStatus('cancelled')}>
            Cancel
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .panel-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 100;
    display: flex;
    justify-content: flex-end;
  }

  .panel-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    border: none;
    cursor: default;
  }

  .panel-slide {
    position: relative;
    width: 480px;
    max-width: 90vw;
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    height: 100%;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .panel-header {
    padding: var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .panel-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .panel-title-row h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .panel-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .panel-date {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    padding: 0 var(--space-5);
  }

  .tab-btn {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-btn:hover {
    color: var(--color-text);
  }

  .tab-btn.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .summary-section {
    margin-bottom: var(--space-5);
  }

  .summary-section h4 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-section p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
  }

  .detail-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    margin: 0;
  }

  .detail-list dt {
    color: var(--color-muted);
    font-weight: 500;
  }

  .tab-empty {
    text-align: center;
    color: var(--color-muted);
    font-size: var(--text-sm);
    padding: var(--space-8) 0;
  }

  .logs-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .log-entry {
    padding: var(--space-3);
    background: var(--color-bg);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
  }

  .log-time {
    color: var(--color-muted);
    margin-left: var(--space-2);
  }

  .log-content {
    margin: var(--space-2) 0 0 0;
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .log-tool {
    color: var(--color-muted);
    font-style: italic;
  }

  .panel-footer {
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .reply-bar {
    display: flex;
    gap: var(--space-2);
  }

  .reply-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    outline: none;
  }

  .reply-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }

  .action-bar {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
</style>
