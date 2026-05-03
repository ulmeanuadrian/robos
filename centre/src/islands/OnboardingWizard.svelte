<script lang="ts">
  let visible = $state(false);
  let loading = $state(true);
  let currentStep = $state(0);

  const steps = [
    {
      title: 'Brand Voice',
      description: 'Define your brand\'s tone, personality, and communication style. This shapes how all content skills write for you.',
      file: 'brand/voice.md',
      command: 'Open Claude Code and run: "Set up my brand voice"',
    },
    {
      title: 'Audience',
      description: 'Document your target audience segments, their pain points, and what language resonates with them.',
      file: 'brand/audience.md',
      command: 'Open Claude Code and run: "Define my target audience"',
    },
    {
      title: 'Positioning',
      description: 'Capture your unique value proposition, competitive positioning, and key differentiators.',
      file: 'brand/positioning.md',
      command: 'Open Claude Code and run: "Define my brand positioning"',
    },
  ];

  async function checkBrandFiles() {
    try {
      const res = await fetch('/api/files?path=brand/voice.md');
      if (res.status === 404) {
        visible = true;
      }
    } catch {
      // If API is not available, don't show onboarding
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    checkBrandFiles();
  });

  function dismiss() {
    visible = false;
  }
</script>

{#if !loading && visible}
  <div class="wizard card">
    <div class="wizard-header">
      <div>
        <h3>Welcome to RobOS</h3>
        <p>Complete these steps to get the most out of your skills.</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={dismiss}>Dismiss</button>
    </div>

    <div class="wizard-steps">
      {#each steps as step, i}
        <div class="step" class:active={currentStep === i} class:completed={i < currentStep}>
          <div class="step-indicator">
            <span class="step-number">{i < currentStep ? '✓' : i + 1}</span>
          </div>
          <div class="step-content">
            <h4>{step.title}</h4>
            {#if currentStep === i}
              <p>{step.description}</p>
              <div class="step-file">
                <code>{step.file}</code>
              </div>
              <p class="step-hint">{step.command}</p>
              <div class="step-actions">
                {#if i > 0}
                  <button class="btn btn-ghost btn-sm" onclick={() => currentStep = i - 1}>Back</button>
                {/if}
                <button class="btn btn-primary btn-sm" onclick={() => { if (i < steps.length - 1) currentStep = i + 1; else dismiss(); }}>
                  {i < steps.length - 1 ? 'Next' : 'Done'}
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
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

  .wizard-steps {
    padding: var(--space-4) var(--space-5);
  }

  .step {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    opacity: 0.5;
  }

  .step.active {
    opacity: 1;
  }

  .step.completed {
    opacity: 0.7;
  }

  .step-indicator {
    flex-shrink: 0;
  }

  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-bg);
    border: 2px solid var(--color-border);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-muted);
  }

  .step.active .step-number {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .step.completed .step-number {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }

  .step-content {
    flex: 1;
  }

  .step-content h4 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .step-content p {
    margin: var(--space-2) 0 0 0;
    font-size: var(--text-sm);
    color: var(--color-muted);
    line-height: var(--leading-relaxed);
  }

  .step-file {
    margin-top: var(--space-2);
  }

  .step-file code {
    font-size: var(--text-xs);
    background: var(--color-surface);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .step-hint {
    font-style: italic;
  }

  .step-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
</style>
