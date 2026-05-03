<script lang="ts">
  interface FileEntry {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileEntry[];
  }

  let tree = $state<FileEntry[]>([]);
  let loading = $state(true);
  let selectedPath = $state('');
  let fileContent = $state('');
  let fileLoading = $state(false);
  let expandedDirs = $state<Set<string>>(new Set());

  async function fetchTree() {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      tree = await res.json();
    } catch {
      tree = [];
    } finally {
      loading = false;
    }
  }

  async function loadFile(path: string) {
    selectedPath = path;
    fileLoading = true;
    fileContent = '';
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        fileContent = typeof data === 'string' ? data : data.content ?? '';
      } else {
        fileContent = `Error loading file: HTTP ${res.status}`;
      }
    } catch (e: any) {
      fileContent = `Error: ${e.message}`;
    } finally {
      fileLoading = false;
    }
  }

  function toggleDir(path: string) {
    const next = new Set(expandedDirs);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    expandedDirs = next;
  }

  $effect(() => {
    fetchTree();
  });

  function fileIcon(entry: FileEntry): string {
    if (entry.type === 'directory') return '&#128194;';
    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md': return '&#128196;';
      case 'json': return '&#128195;';
      case 'js': case 'ts': return '&#128221;';
      case 'yaml': case 'yml': return '&#128203;';
      default: return '&#128196;';
    }
  }
</script>

<div class="browser-header">
  <h2>Files</h2>
  <button class="btn btn-primary btn-sm" onclick={fetchTree}>Refresh</button>
</div>

{#if loading}
  <div class="browser-loading">Loading file tree...</div>
{:else}
  <div class="browser-layout card">
    <div class="tree-pane">
      <div class="tree-header">Workspace</div>
      <div class="tree-body">
        {#each tree as entry}
          {@render treeNode(entry, 0)}
        {/each}
        {#if tree.length === 0}
          <div class="tree-empty">No files found</div>
        {/if}
      </div>
    </div>
    <div class="content-pane">
      {#if !selectedPath}
        <div class="content-empty">
          <p>Select a file to view its content.</p>
        </div>
      {:else if fileLoading}
        <div class="content-loading">Loading...</div>
      {:else}
        <div class="content-header">
          <span class="content-path">{selectedPath}</span>
        </div>
        <pre class="content-body">{fileContent}</pre>
      {/if}
    </div>
  </div>
{/if}

{#snippet treeNode(entry: FileEntry, depth: number)}
  {#if entry.type === 'directory'}
    <button
      class="tree-item tree-dir"
      style="padding-left: {12 + depth * 16}px"
      onclick={() => toggleDir(entry.path)}
    >
      <span class="tree-arrow" class:expanded={expandedDirs.has(entry.path)}>&#9654;</span>
      <span class="tree-icon">{@html fileIcon(entry)}</span>
      <span class="tree-name">{entry.name}</span>
    </button>
    {#if expandedDirs.has(entry.path) && entry.children}
      {#each entry.children as child}
        {@render treeNode(child, depth + 1)}
      {/each}
    {/if}
  {:else}
    <button
      class="tree-item tree-file"
      class:selected={selectedPath === entry.path}
      style="padding-left: {12 + depth * 16 + 16}px"
      onclick={() => loadFile(entry.path)}
    >
      <span class="tree-icon">{@html fileIcon(entry)}</span>
      <span class="tree-name">{entry.name}</span>
    </button>
  {/if}
{/snippet}

<style>
  .browser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .browser-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }

  .browser-loading {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-muted);
  }

  .browser-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    min-height: 70vh;
    overflow: hidden;
  }

  .tree-pane {
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tree-header {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
  }

  .tree-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--text-xs);
    padding: 4px 12px;
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
    color: var(--color-text);
  }

  .tree-item:hover {
    background: var(--color-surface-hover);
  }

  .tree-file.selected {
    background: #eff6ff;
    color: var(--color-primary);
  }

  .tree-arrow {
    font-size: 8px;
    transition: transform var(--transition-fast);
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }

  .tree-arrow.expanded {
    transform: rotate(90deg);
  }

  .tree-icon {
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .tree-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .content-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-empty, .content-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .content-header {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .content-path {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .content-body {
    flex: 1;
    overflow: auto;
    padding: var(--space-4);
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: var(--leading-relaxed);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
