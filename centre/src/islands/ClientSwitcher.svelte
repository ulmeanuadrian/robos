<script lang="ts">
  import { apiFetch } from '../lib/api-client';

  interface Client {
    slug: string;
    name: string;
    active?: boolean;
    has_brand?: boolean;
    has_memory?: boolean;
  }

  interface ActiveResponse {
    active: { slug: string; name: string } | null;
  }

  let clients = $state<Client[]>([]);
  let active = $state<{ slug: string; name: string } | null>(null);
  let open = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function fetchClients() {
    try {
      const res = await fetch('/api/clients');
      if (res.ok) clients = await res.json();
    } catch {
      // ignore — non-fatal
    }
  }

  async function fetchActive() {
    try {
      const res = await fetch('/api/clients/active');
      if (res.ok) {
        const data: ActiveResponse = await res.json();
        active = data.active;
      }
    } catch {
      // ignore
    }
  }

  $effect(() => {
    fetchClients();
    fetchActive();
  });

  async function selectClient(slug: string | null) {
    if (busy) return;
    busy = true;
    error = null;
    try {
      const res = await apiFetch('/api/clients/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        error = body?.error || `Switch esuat (${res.status})`;
        return;
      }
      const data = await res.json();
      active = data.active;
      open = false;
      // Notify other islands so they can refetch their per-client data
      window.dispatchEvent(
        new CustomEvent('client-change', {
          detail: { clientId: active?.slug || null, active },
        })
      );
      // Also refetch list to update active flag visuals
      fetchClients();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Eroare necunoscuta';
    } finally {
      busy = false;
    }
  }

  const selectedLabel = $derived(active ? active.name : 'Workspace root');
</script>

<div class="switcher">
  <button class="switcher-btn" onclick={() => (open = !open)} disabled={busy}>
    <span class="switcher-label">{selectedLabel}</span>
    <span class="switcher-arrow" class:open>&#9662;</span>
  </button>

  {#if open}
    <div class="switcher-dropdown card">
      <button
        class="dropdown-item"
        class:active={active === null}
        onclick={() => selectClient(null)}
        disabled={busy}
      >
        Workspace root
      </button>
      {#each clients as client}
        <button
          class="dropdown-item"
          class:active={active?.slug === client.slug}
          onclick={() => selectClient(client.slug)}
          disabled={busy}
        >
          <span>{client.name}</span>
          {#if !client.has_brand}
            <span class="dropdown-flag">no brand</span>
          {/if}
        </button>
      {/each}
      {#if clients.length === 0}
        <div class="dropdown-empty">Niciun client. Foloseste <code>bash scripts/add-client.sh &lt;slug&gt;</code></div>
      {/if}
      {#if error}
        <div class="dropdown-error">{error}</div>
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

  .switcher-btn:disabled {
    opacity: 0.6;
    cursor: wait;
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
    min-width: 220px;
    padding: var(--space-1);
    z-index: 60;
    box-shadow: var(--shadow-lg);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .dropdown-item:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .dropdown-item.active {
    background: #eff6ff;
    color: var(--color-primary);
    font-weight: 500;
  }

  .dropdown-item:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .dropdown-flag {
    font-size: var(--text-xs);
    color: var(--color-warning, #b45309);
    margin-left: var(--space-2);
  }

  .dropdown-empty {
    padding: var(--space-3);
    text-align: center;
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .dropdown-empty code {
    font-size: var(--text-xs);
  }

  .dropdown-error {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    color: var(--color-danger, #b91c1c);
    border-top: 1px solid var(--color-border);
  }
</style>
