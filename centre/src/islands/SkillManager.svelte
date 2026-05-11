<script lang="ts">
  import { apiFetch } from '../lib/api-client';

  interface Skill {
    name: string;
    version: string;
    category: string;
    description: string;
    triggers: string[];
    installed: boolean;
  }

  let installedSkills = $state<Skill[]>([]);
  let catalogSkills = $state<Skill[]>([]);
  let loading = $state(true);
  let selectedSkill = $state<Skill | null>(null);
  let skillContent = $state('');
  let contentLoading = $state(false);
  let runMessage = $state('');
  let running = $state(false);

  async function runSelected() {
    if (!selectedSkill || !selectedSkill.installed || running) return;
    running = true;
    runMessage = '';
    try {
      const res = await apiFetch(`/api/skills/${selectedSkill.name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        runMessage = `Pornit (PID ${data.pid}). Log: ${data.log_file}`;
      } else {
        const err = await res.json();
        runMessage = `Eroare: ${err.error || res.statusText}`;
      }
    } catch (e: any) {
      runMessage = `Eroare retea: ${e.message}`;
    } finally {
      running = false;
    }
  }

  async function fetchSkills() {
    try {
      const [installedRes, catalogRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/skills/catalog'),
      ]);

      if (installedRes.ok) {
        installedSkills = await installedRes.json();
      }
      if (catalogRes.ok) {
        catalogSkills = await catalogRes.json();
      }
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  async function selectSkill(skill: Skill) {
    selectedSkill = skill;
    contentLoading = true;
    skillContent = '';
    try {
      const prefix = skill.installed ? 'skills' : 'skills/_catalog';
      const res = await fetch(`/api/files?path=${prefix}/${skill.name}/SKILL.md`);
      if (res.ok) {
        const data = await res.json();
        skillContent = typeof data === 'string' ? data : data.content ?? '';
      } else {
        skillContent = 'Could not load skill documentation.';
      }
    } catch {
      skillContent = 'Error loading skill content.';
    } finally {
      contentLoading = false;
    }
  }

  $effect(() => {
    fetchSkills();
  });

  function categoryColor(cat: string): string {
    switch (cat) {
      case 'content': return 'badge-primary';
      case 'brand': return 'badge-warning';
      case 'research': return 'badge-success';
      case 'sys': return 'badge-muted';
      case 'tool': return 'badge-error';
      case 'mode': return 'badge-secondary';
      case '00': return 'badge-info';     // orchestratori multi-skill
      case 'viz': return 'badge-purple';   // vizualizare (slides, diagrame, imagini)
      case 'vid': return 'badge-pink';     // video production
      case 'meta': return 'badge-dark';    // skill-uri despre skill-uri
      default: return 'badge-muted';
    }
  }
</script>

<div class="skills-header">
  <h2>Skills</h2>
  <button class="btn btn-primary btn-sm" onclick={fetchSkills}>Refresh</button>
</div>

{#if loading}
  <div class="skills-loading">Loading skills...</div>
{:else}
  <div class="skills-layout">
    <div class="skills-panel">
      <h3 class="section-title">Installed ({installedSkills.length})</h3>
      {#if installedSkills.length === 0}
        <p class="skills-empty">No skills installed yet.</p>
      {:else}
        <div class="skills-grid">
          {#each installedSkills as skill}
            <button class="skill-card card" class:selected={selectedSkill?.name === skill.name} onclick={() => selectSkill(skill)}>
              <div class="skill-name">{skill.name}</div>
              <span class="badge {categoryColor(skill.category)}">{skill.category}</span>
              <p class="skill-desc">{skill.description}</p>
              {#if skill.triggers.length > 0}
                <div class="skill-triggers">
                  {#each skill.triggers.slice(0, 2) as trigger}
                    <code class="trigger-phrase">"{trigger}"</code>
                  {/each}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      {#if catalogSkills.length > 0}
        <h3 class="section-title catalog-title">Catalog ({catalogSkills.length})</h3>
        <div class="skills-grid">
          {#each catalogSkills as skill}
            <div class="skill-card card catalog-card" class:selected={selectedSkill?.name === skill.name} role="button" tabindex="0" onclick={() => selectSkill(skill)} onkeydown={(e) => { if (e.key === 'Enter') selectSkill(skill); }}>
              <div class="skill-name">{skill.name}</div>
              <span class="badge {categoryColor(skill.category)}">{skill.category}</span>
              <p class="skill-desc">{skill.description}</p>
              <button class="btn btn-secondary btn-sm install-btn" onclick={(e) => { e.stopPropagation(); }}>
                Install
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if selectedSkill}
      <div class="skill-detail card">
        <div class="detail-header">
          <h3>{selectedSkill.name}</h3>
          <span class="badge {categoryColor(selectedSkill.category)}">{selectedSkill.category}</span>
          {#if selectedSkill.version}
            <span class="detail-version">v{selectedSkill.version}</span>
          {/if}
          {#if selectedSkill.installed}
            <button class="btn btn-primary btn-sm" onclick={runSelected} disabled={running} style="margin-left:auto;">
              {running ? 'Se ruleaza...' : 'Run now'}
            </button>
          {/if}
        </div>
        {#if runMessage}
          <div class="run-message">{runMessage}</div>
        {/if}
        <div class="detail-body">
          {#if contentLoading}
            <p class="detail-loading">Loading...</p>
          {:else}
            <pre class="detail-content">{skillContent}</pre>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .skills-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .skills-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 600;
  }

  .skills-loading, .skills-empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .skills-layout {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: var(--space-6);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-3) 0;
  }

  .run-message {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-left: 3px solid var(--color-primary);
    font-size: var(--text-xs);
    color: var(--color-muted);
    margin-bottom: var(--space-3);
    word-break: break-all;
  }

  .catalog-title {
    margin-top: var(--space-6);
  }

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3);
  }

  .skill-card {
    text-align: left;
    cursor: pointer;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    width: 100%;
    font-family: inherit;
    font-size: inherit;
    transition: all var(--transition-fast);
  }

  .skill-card:hover {
    border-color: var(--color-primary);
  }

  .skill-card.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }

  .catalog-card {
    opacity: 0.8;
    border-style: dashed;
  }

  .skill-name {
    font-weight: 600;
    font-size: var(--text-sm);
    margin-bottom: var(--space-1);
  }

  .skill-desc {
    font-size: var(--text-xs);
    color: var(--color-muted);
    margin: var(--space-2) 0;
    line-height: var(--leading-relaxed);
  }

  .skill-triggers {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .trigger-phrase {
    font-size: 0.65rem;
    background: var(--color-bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    color: var(--color-muted);
  }

  .install-btn {
    margin-top: var(--space-2);
  }

  .skill-detail {
    position: sticky;
    top: 72px;
    max-height: calc(100vh - 100px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .detail-header h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .detail-version {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .detail-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
  }

  .detail-loading {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  .detail-content {
    white-space: pre-wrap;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    line-height: var(--leading-relaxed);
    margin: 0;
  }

  @media (max-width: 1024px) {
    .skills-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
