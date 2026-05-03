<script lang="ts">
  import TaskPanel from './TaskPanel.svelte';

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

  const columns = [
    { id: 'backlog', label: 'Backlog', color: 'var(--color-muted)' },
    { id: 'active', label: 'Active', color: 'var(--color-primary)' },
    { id: 'review', label: 'Review', color: 'var(--color-warning)' },
    { id: 'done', label: 'Done', color: 'var(--color-success)' },
  ];

  let tasks = $state<Task[]>([]);
  let loading = $state(true);
  let selectedTask = $state<Task | null>(null);

  const grouped = $derived(
    columns.map(col => ({
      ...col,
      tasks: tasks.filter(t => t.status === col.id),
    }))
  );

  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      tasks = await res.json();
    } catch {
      tasks = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    fetchTasks();
  });

  function selectTask(task: Task) {
    selectedTask = task;
  }

  function closePanel() {
    selectedTask = null;
    fetchTasks();
  }

  function durationLabel(task: Task): string {
    if (!task.completedAt || !task.createdAt) return '';
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.completedAt).getTime();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
</script>

<div class="board-header">
  <h2>Task Board</h2>
  <button class="btn btn-primary btn-sm" onclick={fetchTasks}>Refresh</button>
</div>

{#if loading}
  <div class="board-loading">Loading tasks...</div>
{:else}
  <div class="board-columns">
    {#each grouped as column}
      <div class="board-column">
        <div class="column-header">
          <span class="column-dot" style="background: {column.color}"></span>
          <span class="column-label">{column.label}</span>
          <span class="column-count">{column.tasks.length}</span>
        </div>
        <div class="column-body">
          {#each column.tasks as task}
            <button class="task-card card" onclick={() => selectTask(task)}>
              <span class="task-title">{task.title}</span>
              <div class="task-meta">
                {#if task.model}
                  <span class="badge badge-muted">{task.model}</span>
                {/if}
                {#if task.tag}
                  <span class="badge badge-primary">{task.tag}</span>
                {/if}
                {#if task.status === 'done'}
                  {@const dur = durationLabel(task)}
                  {#if dur}
                    <span class="task-duration">{dur}</span>
                  {/if}
                {/if}
              </div>
              {#if task.needsInput}
                <div class="needs-input">Needs input</div>
              {/if}
            </button>
          {:else}
            <div class="column-empty">No tasks</div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if selectedTask}
  <TaskPanel task={selectedTask} onclose={closePanel} />
{/if}

<style>
  .board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .board-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }

  .board-loading {
    text-align: center;
    padding: var(--space-16) 0;
    color: var(--color-muted);
  }

  .board-columns {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
    min-height: 60vh;
  }

  .board-column {
    display: flex;
    flex-direction: column;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2);
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .column-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .column-label {
    flex: 1;
  }

  .column-count {
    font-size: var(--text-xs);
    color: var(--color-muted);
    font-weight: 500;
    background: var(--color-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
  }

  .column-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-bg);
    border-radius: var(--radius-lg);
    min-height: 200px;
  }

  .task-card {
    text-align: left;
    cursor: pointer;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    width: 100%;
    font-family: inherit;
    font-size: inherit;
    transition: all var(--transition-fast);
  }

  .task-card:hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-md);
  }

  .task-title {
    display: block;
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-2);
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .task-duration {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .needs-input {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-warning);
    font-weight: 500;
  }

  .column-empty {
    text-align: center;
    padding: var(--space-8) 0;
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  @media (max-width: 768px) {
    .board-columns {
      grid-template-columns: 1fr;
    }
  }
</style>
