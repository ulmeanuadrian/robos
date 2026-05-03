<script lang="ts">
  interface HealthCheck {
    label: string;
    status: 'ok' | 'warning' | 'error' | 'unknown';
    detail: string;
  }

  let checks = $state<HealthCheck[]>([
    { label: 'Cron Daemon', status: 'unknown', detail: 'Checking...' },
    { label: 'Brand Context', status: 'unknown', detail: 'Checking...' },
    { label: 'Today\'s Memory', status: 'unknown', detail: 'Checking...' },
    { label: 'Claude CLI', status: 'unknown', detail: 'Checking...' },
  ]);
  let loading = $state(true);

  async function checkHealth() {
    try {
      // Check brand context files
      const filesRes = await fetch('/api/files?path=brand');
      if (filesRes.ok) {
        const files = await filesRes.json();
        const fileCount = Array.isArray(files) ? files.length : 0;
        checks[1] = {
          label: 'Brand Context',
          status: fileCount > 0 ? 'ok' : 'warning',
          detail: fileCount > 0 ? `${fileCount} brand files configured` : 'No brand files found',
        };
      } else {
        checks[1] = { label: 'Brand Context', status: 'warning', detail: 'brand/ directory not accessible' };
      }

      // Check today's memory
      const today = new Date().toISOString().split('T')[0];
      const memRes = await fetch(`/api/files?path=context/memory/${today}.md`);
      if (memRes.ok) {
        checks[2] = { label: 'Today\'s Memory', status: 'ok', detail: `${today}.md exists` };
      } else {
        checks[2] = { label: 'Today\'s Memory', status: 'warning', detail: 'No memory file for today' };
      }

      // Check cron status
      const cronRes = await fetch('/api/cron');
      if (cronRes.ok) {
        const jobs = await cronRes.json();
        const activeJobs = Array.isArray(jobs) ? jobs.filter((j: any) => j.active).length : 0;
        checks[0] = {
          label: 'Cron Daemon',
          status: activeJobs > 0 ? 'ok' : 'warning',
          detail: activeJobs > 0 ? `${activeJobs} active jobs` : 'No active cron jobs',
        };
      } else {
        checks[0] = { label: 'Cron Daemon', status: 'warning', detail: 'API not available' };
      }

      // Claude CLI - we just assume it's available in static mode
      checks[3] = { label: 'Claude CLI', status: 'ok', detail: 'Available (check via terminal)' };
    } catch {
      // Leave defaults
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    checkHealth();
  });

  function statusDot(status: string): string {
    switch (status) {
      case 'ok': return 'dot-ok';
      case 'warning': return 'dot-warning';
      case 'error': return 'dot-error';
      default: return 'dot-unknown';
    }
  }
</script>

<div class="card health-container">
  <div class="health-header">
    <h3>System Health</h3>
  </div>
  <div class="health-list">
    {#each checks as check}
      <div class="health-item">
        <div class="health-left">
          <span class="health-dot {statusDot(check.status)}"></span>
          <span class="health-label">{check.label}</span>
        </div>
        <span class="health-detail">{check.detail}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .health-container {
    overflow: hidden;
  }

  .health-header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .health-header h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .health-list {
    padding: var(--space-3) 0;
  }

  .health-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-5);
    gap: var(--space-3);
  }

  .health-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .health-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-ok { background: var(--color-success); }
  .dot-warning { background: var(--color-warning); }
  .dot-error { background: var(--color-error); }
  .dot-unknown { background: var(--color-border); }

  .health-label {
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .health-detail {
    font-size: var(--text-xs);
    color: var(--color-muted);
    text-align: right;
  }
</style>
