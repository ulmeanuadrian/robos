<script lang="ts">
  interface HealthCheck {
    label: string;
    status: 'ok' | 'warning' | 'error' | 'unknown';
    detail: string;
  }

  let checks = $state<HealthCheck[]>([
    { label: 'Cron Daemon', status: 'unknown', detail: 'Se verifica...' },
    { label: 'Context brand', status: 'unknown', detail: 'Se verifica...' },
    { label: 'Memoria zilei', status: 'unknown', detail: 'Se verifica...' },
    { label: 'Claude CLI', status: 'unknown', detail: 'Se verifica...' },
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
          label: 'Context brand',
          status: fileCount > 0 ? 'ok' : 'warning',
          detail: fileCount > 0 ? `${fileCount} fisiere brand configurate` : 'Niciun fisier brand',
        };
      } else {
        checks[1] = { label: 'Context brand', status: 'warning', detail: 'brand/ inaccesibil' };
      }

      // Check today's memory
      const today = new Date().toISOString().split('T')[0];
      const memRes = await fetch(`/api/files?path=context/memory/${today}.md`);
      if (memRes.ok) {
        checks[2] = { label: 'Memoria zilei', status: 'ok', detail: `${today}.md exista` };
      } else {
        checks[2] = { label: 'Memoria zilei', status: 'warning', detail: 'Niciun fisier memorie azi' };
      }

      // Check cron status
      const cronRes = await fetch('/api/cron');
      if (cronRes.ok) {
        const jobs = await cronRes.json();
        const activeJobs = Array.isArray(jobs) ? jobs.filter((j: any) => j.active).length : 0;
        checks[0] = {
          label: 'Cron Daemon',
          status: activeJobs > 0 ? 'ok' : 'warning',
          detail: activeJobs > 0 ? `${activeJobs} joburi active` : 'Niciun job cron activ',
        };
      } else {
        checks[0] = { label: 'Cron Daemon', status: 'warning', detail: 'API indisponibil' };
      }

      // Claude CLI - check via /api/dashboard/health
      try {
        const cliRes = await fetch('/api/dashboard/health');
        if (cliRes.ok) {
          const health = await cliRes.json();
          checks[3] = {
            label: 'Claude CLI',
            status: health.claudeCli ? 'ok' : 'error',
            detail: health.claudeCli ? 'Disponibil' : 'Nu e instalat -- instaleaza Claude Code',
          };
        } else {
          checks[3] = { label: 'Claude CLI', status: 'unknown', detail: 'Verificare indisponibila' };
        }
      } catch {
        checks[3] = { label: 'Claude CLI', status: 'unknown', detail: 'Verificare indisponibila' };
      }
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
    <h3>Stare sistem</h3>
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
