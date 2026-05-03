<script lang="ts">
  let loading = $state(true);
  let err = $state('');
  let totalCostMonth = $state(0);
  let avgQuality = $state(0);
  let totalRuns = $state(0);
  let skills = $state<any[]>([]);
  let dailyCosts = $state<{ day: string; cost: number }[]>([]);

  async function fetchData() {
    try {
      const [sR, cR, qR] = await Promise.all([
        fetch('/api/analytics/skills'), fetch('/api/analytics/costs'), fetch('/api/analytics/quality'),
      ]);
      if (!sR.ok || !cR.ok || !qR.ok) throw new Error('Failed to fetch analytics');
      const [sD, cD, qD] = await Promise.all([sR.json(), cR.json(), qR.json()]);

      skills = sD;
      totalCostMonth = cD.thisMonth ?? 0;
      totalRuns = skills.reduce((s: number, x: any) => s + (x.totalRuns ?? 0), 0);

      const allQ = qD.perSkill ?? [];
      if (allQ.length > 0) {
        const wSum = allQ.reduce((s: number, q: any) => s + (q.avgQuality ?? 0) * q.runs, 0);
        const rSum = allQ.reduce((s: number, q: any) => s + q.runs, 0);
        avgQuality = rSum > 0 ? Math.round((wSum / rSum) * 10) / 10 : 0;
      }

      const days: { day: string; cost: number }[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        days.push({ day: d.toLocaleDateString('en', { weekday: 'short' }), cost: 0 });
      }
      const weekCost = cD.thisWeek ?? 0;
      if (weekCost > 0) for (const d of days) d.cost = Math.round((weekCost / 7) * 10000) / 10000;
      dailyCosts = days;
    } catch (e: any) { err = e.message; }
    finally { loading = false; }
  }

  const maxCost = $derived(Math.max(...dailyCosts.map(d => d.cost), 0.001));
  const trendIcon = (t: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
  const trendColor = (t: string) => t === 'up' ? 'var(--color-success)' : t === 'down' ? 'var(--color-error)' : 'var(--color-muted)';

  $effect(() => { fetchData(); });
</script>

{#if err}<div class="card err-banner">{err}</div>{/if}

<div class="summary-grid">
  {#each [
    { icon: '$', val: loading ? '--' : `$${totalCostMonth.toFixed(2)}`, label: 'Cost this month', bg: 'var(--color-warning-bg)', fg: 'var(--color-warning)' },
    { icon: 'Q', val: loading ? '--' : `${avgQuality}/10`, label: 'Avg quality score', bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
    { icon: '#', val: loading ? '--' : `${totalRuns}`, label: 'Total skill runs', bg: 'var(--color-info-bg)', fg: 'var(--color-info)' },
  ] as c}
    <div class="card sc">
      <div class="sc-icon" style="background:{c.bg};color:{c.fg}">{c.icon}</div>
      <div class="sc-info">
        <span class="sc-val" class:loading>{c.val}</span>
        <span class="sc-label">{c.label}</span>
      </div>
    </div>
  {/each}
</div>

<div class="card section">
  <h3 class="stitle">Per-Skill Breakdown</h3>
  {#if loading}<p class="muted">Loading...</p>
  {:else if skills.length === 0}<p class="muted">No skill runs recorded yet.</p>
  {:else}
    <table class="tbl">
      <thead><tr><th>Skill</th><th>Runs</th><th>Avg Cost</th><th>Avg Duration</th><th>Avg Quality</th><th>Trend</th></tr></thead>
      <tbody>
        {#each skills as s}
          <tr>
            <td class="mono">{s.skillName}</td><td>{s.totalRuns}</td>
            <td>${(s.avgCost ?? 0).toFixed(4)}</td><td>{(s.avgDuration ?? 0).toFixed(1)}s</td>
            <td>{s.avgQuality ?? '-'}</td>
            <td><span class="trend" style="color:{trendColor(s.trend)}">{trendIcon(s.trend)}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="card section">
  <h3 class="stitle">Cost - Last 7 Days</h3>
  {#if loading}<p class="muted">Loading...</p>
  {:else}
    <div class="chart">
      {#each dailyCosts as day}
        <div class="col">
          <div class="bar" style="height:{maxCost > 0 ? (day.cost / maxCost) * 120 : 0}px" title="${day.cost.toFixed(4)}"></div>
          <span class="blabel">{day.day}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .err-banner { padding: var(--space-4); background: var(--color-error-bg); color: var(--color-error); margin-bottom: var(--space-4); }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); margin-bottom: var(--space-6); }
  .sc { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-5); }
  .sc-icon { width: 48px; height: 48px; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 700; flex-shrink: 0; }
  .sc-info { display: flex; flex-direction: column; }
  .sc-val { font-size: var(--text-2xl); font-weight: 700; line-height: 1; }
  .sc-val.loading { opacity: 0.3; }
  .sc-label { font-size: var(--text-sm); color: var(--color-muted); margin-top: var(--space-1); }
  .section { padding: var(--space-5); margin-bottom: var(--space-6); }
  .stitle { font-size: var(--text-lg); font-weight: 600; margin: 0 0 var(--space-4) 0; }
  .muted { color: var(--color-muted); font-size: var(--text-sm); }
  .tbl { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .tbl th { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 2px solid var(--color-border); color: var(--color-muted); font-weight: 500; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; }
  .tbl td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); }
  .tbl tbody tr:hover { background: var(--color-surface-hover); }
  .mono { font-weight: 500; font-family: var(--font-mono); font-size: var(--text-xs); }
  .trend { font-size: var(--text-lg); font-weight: 700; }
  .chart { display: flex; align-items: flex-end; gap: var(--space-3); height: 160px; padding-top: var(--space-4); }
  .col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); }
  .bar { width: 100%; max-width: 48px; background: var(--color-primary); border-radius: var(--radius-sm) var(--radius-sm) 0 0; min-height: 2px; transition: height var(--transition-normal); }
  .blabel { font-size: var(--text-xs); color: var(--color-muted); }
  @media (max-width: 768px) { .summary-grid { grid-template-columns: 1fr; } }
</style>
