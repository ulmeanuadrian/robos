<script lang="ts">
  interface Activity {
    id: string;
    title: string;
    status: string;
    completedAt: string | null;
    updatedAt: string;
    model: string | null;
    tag: string | null;
  }

  let activities = $state<Activity[]>([]);
  let loading = $state(true);

  async function fetchActivity() {
    try {
      const res = await fetch('/api/tasks?status=done&limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      activities = await res.json();
    } catch {
      activities = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    fetchActivity();
  });

  function timeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  }

  function statusIcon(status: string): string {
    switch (status) {
      case 'done': return '✓';
      case 'active': return '▶';
      case 'review': return '●';
      case 'cancelled': return '✗';
      default: return '○';
    }
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'done': return 'var(--color-success)';
      case 'active': return 'var(--color-primary)';
      case 'review': return 'var(--color-warning)';
      case 'cancelled': return 'var(--color-error)';
      default: return 'var(--color-muted)';
    }
  }
</script>

<div class="card feed-container">
  <div class="feed-header">
    <h3>Recent Activity</h3>
  </div>

  {#if loading}
    <div class="feed-loading">
      <span class="spinner"></span>
      Loading activity...
    </div>
  {:else if activities.length === 0}
    <div class="feed-empty">
      <p>No completed tasks yet. Activity will appear here as tasks are finished.</p>
    </div>
  {:else}
    <div class="feed-list">
      {#each activities as activity}
        <div class="feed-item">
          <div class="feed-dot" style="color: {statusColor(activity.status)}">
            {statusIcon(activity.status)}
          </div>
          <div class="feed-content">
            <span class="feed-title">{activity.title}</span>
            <div class="feed-meta">
              {#if activity.model}
                <span class="badge badge-muted">{activity.model}</span>
              {/if}
              {#if activity.tag}
                <span class="badge badge-primary">{activity.tag}</span>
              {/if}
              <span class="feed-time">
                {timeAgo(activity.completedAt ?? activity.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .feed-container {
    overflow: hidden;
  }

  .feed-header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .feed-header h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .feed-loading, .feed-empty {
    padding: var(--space-8) var(--space-5);
    text-align: center;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: var(--space-2);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .feed-list {
    padding: var(--space-2) 0;
  }

  .feed-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    transition: background var(--transition-fast);
  }

  .feed-item:hover {
    background: var(--color-surface-hover);
  }

  .feed-dot {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .feed-content {
    flex: 1;
    min-width: 0;
  }

  .feed-title {
    font-size: var(--text-sm);
    font-weight: 500;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feed-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .feed-time {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }
</style>
