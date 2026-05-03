<script lang="ts">
  interface Client {
    slug: string;
    name: string;
  }

  let clients = $state<Client[]>([]);
  let selected = $state('all');
  let open = $state(false);

  async function fetchClients() {
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        clients = await res.json();
      }
    } catch {
      // ignore
    }
  }

  $effect(() => {
    fetchClients();
  });

  function selectClient(slug: string) {
    selected = slug;
    open = false;
    // Dispatch event for other components to listen to
    window.dispatchEvent(new CustomEvent('client-change', { detail: { clientId: slug === 'all' ? null : slug } }));
  }

  const selectedLabel = $derived(
    selected === 'all' ? 'All Clients' : clients.find(c => c.slug === selected)?.name ?? selected
  );
</script>

<div class="switcher">
  <button class="switcher-btn" onclick={() => open = !open}>
    <span class="switcher-label">{selectedLabel}</span>
    <span class="switcher-arrow" class:open>&#9662;</span>
  </button>

  {#if open}
    <div class="switcher-dropdown card">
      <button
        class="dropdown-item"
        class:active={selected === 'all'}
        onclick={() => selectClient('all')}
      >
        All Clients
      </button>
      {#each clients as client}
        <button
          class="dropdown-item"
          class:active={selected === client.slug}
          onclick={() => selectClient(client.slug)}
        >
          {client.name}
        </button>
      {/each}
      {#if clients.length === 0}
        <div class="dropdown-empty">No clients configured</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
  }

  .switcher-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: inherit;
    color: var(--color-text);
  }

  .switcher-btn:hover {
    border-color: var(--color-primary);
  }

  .switcher-arrow {
    font-size: 10px;
    transition: transform var(--transition-fast);
  }

  .switcher-arrow.open {
    transform: rotate(180deg);
  }

  .switcher-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-1);
    min-width: 180px;
    padding: var(--space-1);
    z-index: 60;
    box-shadow: var(--shadow-lg);
  }

  .dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    font-family: inherit;
    color: var(--color-text);
  }

  .dropdown-item:hover {
    background: var(--color-surface-hover);
  }

  .dropdown-item.active {
    background: #eff6ff;
    color: var(--color-primary);
    font-weight: 500;
  }

  .dropdown-empty {
    padding: var(--space-3);
    text-align: center;
    font-size: var(--text-xs);
    color: var(--color-muted);
  }
</style>
