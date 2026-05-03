<script lang="ts">
  let activeTasks = $state(0);
  let reviewTasks = $state(0);
  let skillsCount = $state(0);
  let cronActive = $state(0);
  let loading = $state(true);
  let error = $state('');

  async function fetchSummary() {
    try {
      const res = await fetch('/api/dashboard/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      activeTasks = data.activeTasks ?? 0;
      reviewTasks = data.reviewTasks ?? 0;
      skillsCount = data.skillsCount ?? 0;
      cronActive = data.cronActive ?? 0;
    } catch (e: any) {
      error = e.message;
      // Use fallback zeros
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    fetchSummary();
  });

  const cards = $derived([
    {
      label: 'Active Tasks',
      count: activeTasks,
      color: 'var(--color-primary)',
      bg: '#eff6ff',
      icon: '&#9654;',
    },
    {
      label: 'Needs Review',
      count: reviewTasks,
      color: '#d97706',
      bg: 'var(--color-warning-bg)',
      icon: '&#9888;',
    },
    {
      label: 'Skills Installed',
      count: skillsCount,
      color: '#7c3aed',
      bg: '#f5f3ff',
      icon: '&#10070;',
    },
    {
      label: 'Cron Active',
      count: cronActive,
      color: '#059669',
      bg: 'var(--color-success-bg)',
      icon: '&#9200;',
    },
  ]);
</script>

<div class="status-grid">
  {#each cards as card}
    <div class="status-card card">
      <div class="card-icon" style="background: {card.bg}; color: {card.color}">
        {@html card.icon}
      </div>
      <div class="card-info">
        <span class="card-count" class:loading>
          {loading ? '--' : card.count}
        </span>
        <span class="card-label">{card.label}</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .status-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
  }

  .status-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    transition: box-shadow var(--transition-fast);
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .card-info {
    display: flex;
    flex-direction: column;
  }

  .card-count {
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
  }

  .card-count.loading {
    opacity: 0.3;
  }

  .card-label {
    font-size: var(--text-sm);
    color: var(--color-muted);
    margin-top: var(--space-1);
  }

  @media (max-width: 768px) {
    .status-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
