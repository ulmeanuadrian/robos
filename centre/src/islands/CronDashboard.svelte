<script lang="ts">
  interface CronJob {
    slug: string;
    name: string;
    schedule: string;
    days: string;
    model: string;
    active: number;
    timeout: string;
    retries: number;
    notify: string;
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

  let jobs = $state<CronJob[]>([]);
  let loading = $state(true);
  let expandedJob = $state<string | null>(null);
  let jobHistory = $state<Record<string, CronRun[]>>({});

  async function fetchJobs() {
    try {
      const res = await fetch('/api/cron');
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
      const res = await fetch(`/api/cron/${slug}/history`);
      if (res.ok) {
        jobHistory[slug] = await res.json();
      }
    } catch {
      // ignore
    }
  }

  async function toggleJob(slug: string, active: boolean) {
    try {
      await fetch(`/api/cron/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: active ? 1 : 0 }),
      });
      const job = jobs.find(j => j.slug === slug);
      if (job) job.active = active ? 1 : 0;
    } catch {
      // ignore
    }
  }

  async function triggerRun(slug: string) {
    try {
      await fetch(`/api/cron/${slug}/run`, { method: 'POST' });
      fetchJobs();
    } catch {
      // ignore
    }
  }

  function toggleExpand(slug: string) {
    if (expandedJob === slug) {
      expandedJob = null;
    } else {
      expandedJob = slug;
      if (!jobHistory[slug]) {
        fetchHistory(slug);
      }
    }
  }

  $effect(() => {
    fetchJobs();
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
  <h2>Cron Schedule</h2>
  <button class="btn btn-primary btn-sm" onclick={fetchJobs}>Refresh</button>
</div>

{#if loading}
  <div class="cron-loading">Loading cron jobs...</div>
{:else if jobs.length === 0}
  <div class="cron-empty card">
    <p>No cron jobs configured.</p>
    <p class="cron-hint">Add jobs by placing definitions in <code>cron/jobs/</code> or via the API.</p>
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
            </div>
            <div class="cron-schedule">
              <code>{job.schedule}</code>
              <span class="cron-days">{job.days}</span>
              <span class="cron-timeout">timeout: {job.timeout}</span>
            </div>
          </div>
          <div class="cron-last-run">
            {#if job.lastRun}
              <span class="badge {resultBadge(job.lastRun.result)}">{job.lastRun.result}</span>
              <span class="cron-duration">{formatDuration(job.lastRun.durationSec)}</span>
            {:else}
              <span class="cron-no-runs">Never run</span>
            {/if}
          </div>
          <div class="cron-actions">
            <button class="btn btn-secondary btn-sm" onclick={() => triggerRun(job.slug)}>
              Run Now
            </button>
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => toggleJob(job.slug, !job.active)}
            >
              {job.active ? 'Pause' : 'Resume'}
            </button>
            <button class="btn btn-ghost btn-sm" onclick={() => toggleExpand(job.slug)}>
              {expandedJob === job.slug ? 'Hide' : 'History'}
            </button>
          </div>
        </div>

        {#if expandedJob === job.slug}
          <div class="cron-history">
            <h4>Run History</h4>
            {#if !jobHistory[job.slug]}
              <p class="history-empty">Loading...</p>
            {:else if jobHistory[job.slug].length === 0}
              <p class="history-empty">No runs recorded.</p>
            {:else}
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Result</th>
                    <th>Duration</th>
                    <th>Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {#each jobHistory[job.slug] as run}
                    <tr>
                      <td>{formatDate(run.startedAt)}</td>
                      <td><span class="badge {resultBadge(run.result)}">{run.result}</span></td>
                      <td>{formatDuration(run.durationSec)}</td>
                      <td><span class="badge badge-muted">{run.trigger}</span></td>
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
  }

  .cron-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  .cron-status-dot.active {
    background: var(--color-success);
  }

  .cron-status-dot.paused {
    background: var(--color-muted);
  }

  .cron-schedule {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-muted);
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
</style>
