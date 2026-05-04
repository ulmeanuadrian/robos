<script lang="ts">
  let visible = $state(false);
  let loading = $state(true);
  let onboarded = $state(false);
  let auditScore = $state<number | null>(null);

  async function checkStatus() {
    try {
      const res = await fetch('/api/files?path=brand/voice.md');
      if (res.ok) {
        const data = await res.json();
        const content = data?.content ?? '';
        const isTemplate = content.includes('<!-- ') && !content.includes('## Tone\n');
        const hasRealContent = content.length > 200 && !isTemplate;

        if (hasRealContent) {
          onboarded = true;
          await checkAuditScore();
        } else {
          visible = true;
        }
      } else {
        visible = true;
      }
    } catch {
      // API not available
    } finally {
      loading = false;
    }
  }

  async function checkAuditScore() {
    try {
      const res = await fetch('/api/files?path=context/audits');
      if (res.ok) {
        const entries = await res.json();
        if (Array.isArray(entries) && entries.length > 0) {
          const latest = entries.filter((e: any) => e.type === 'file').sort().pop();
          if (latest) {
            const fileRes = await fetch(`/api/files?path=${latest.path}`);
            if (fileRes.ok) {
              const data = await fileRes.json();
              const match = data?.content?.match(/Score:\s*(\d+)\/100/);
              if (match) auditScore = parseInt(match[1]);
            }
          }
        }
      }
    } catch { /* no audit yet */ }
  }

  $effect(() => { checkStatus(); });

  function dismiss() { visible = false; }

  const packs = [
    { id: 'consultant', label: 'Consultant / Coach', desc: 'Expert solo care vinde cunostinte si servicii' },
    { id: 'agency', label: 'Agentie', desc: 'Echipa de 2-10 oameni pe proiecte client' },
    { id: 'ecommerce', label: 'E-commerce', desc: 'Vinde produse online' },
    { id: 'creator', label: 'Creator', desc: 'Content-first: YouTube, newsletter, cursuri' },
  ];
</script>

{#if !loading && visible}
  <div class="wizard card">
    <div class="wizard-header">
      <div>
        <h3>Bine ai venit in robOS</h3>
        <p>Fii productiv in 15 minute. Deschide Claude Code in acest director si spune:</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={dismiss}>Dismiss</button>
    </div>

    <div class="wizard-body">
      <div class="command-block">
        <code>onboard me</code>
        <p class="command-hint">Porneste un interviu interactiv care iti configureaza brand-ul, vocea, audienta, prioritatile si ruleaza primul skill live.</p>
      </div>

      <div class="packs-section">
        <h4>Starter packs disponibile</h4>
        <div class="packs-grid">
          {#each packs as pack}
            <div class="pack-card">
              <strong>{pack.label}</strong>
              <span>{pack.desc}</span>
            </div>
          {/each}
        </div>
        <p class="packs-note">Skill-ul de onboarding te va intreba sa alegi unul si sa-l personalizezi pentru business-ul tau.</p>
      </div>

      <div class="alt-actions">
        <p>Sau ruleaza pasi individuali:</p>
        <ul>
          <li><code>set up my brand voice</code> -- doar profil voce</li>
          <li><code>define my target audience</code> -- doar audienta</li>
          <li><code>audit</code> -- verifica scorul 4C curent</li>
        </ul>
      </div>
    </div>
  </div>
{/if}

{#if !loading && onboarded && auditScore !== null}
  <div class="audit-badge card">
    <div class="audit-score" class:low={auditScore < 40} class:mid={auditScore >= 40 && auditScore < 70} class:high={auditScore >= 70}>
      {auditScore}
    </div>
    <div class="audit-info">
      <strong>Scor 4C</strong>
      <span>Spune <code>audit</code> in Claude Code ca sa actualizezi</span>
    </div>
  </div>
{/if}

<style>
  .wizard {
    overflow: hidden;
    border: 1px solid #dbeafe;
    background: linear-gradient(135deg, #eff6ff 0%, var(--color-surface) 100%);
  }

  .wizard-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }

  .wizard-header h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .wizard-header p {
    margin: var(--space-1) 0 0 0;
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  .wizard-body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .command-block {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  .command-block code {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-primary);
  }

  .command-hint {
    margin: var(--space-2) 0 0 0;
    font-size: var(--text-sm);
    color: var(--color-muted);
    line-height: var(--leading-relaxed);
  }

  .packs-section h4 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .packs-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .pack-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .pack-card strong {
    font-size: var(--text-sm);
  }

  .pack-card span {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .packs-note {
    margin: var(--space-2) 0 0 0;
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .alt-actions {
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  .alt-actions p { margin: 0 0 var(--space-2) 0; }

  .alt-actions ul {
    margin: 0;
    padding-left: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .alt-actions code {
    font-size: var(--text-xs);
    background: var(--color-bg);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .audit-badge {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
  }

  .audit-score {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xl);
    font-weight: 700;
    color: white;
    flex-shrink: 0;
  }

  .audit-score.low { background: #ef4444; }
  .audit-score.mid { background: #d97706; }
  .audit-score.high { background: #059669; }

  .audit-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .audit-info strong { font-size: var(--text-sm); }

  .audit-info span {
    font-size: var(--text-xs);
    color: var(--color-muted);
  }

  .audit-info code {
    font-size: var(--text-xs);
    background: var(--color-bg);
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 768px) {
    .packs-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
