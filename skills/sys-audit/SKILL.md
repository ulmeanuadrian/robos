---
name: sys-audit
version: 1.2.0
category: sys
description: "Scor 4C (Context, Connections, Capabilities, Cadence) din 100. Identifica top gaps, sugereaza fix-uri, poate auto-repara gap-urile intr-un loop bounded. Cache pe baza mtime hash pentru re-run-uri rapide."
triggers:
  - "audit"
  - "verifica setup-ul"
  - "cum stau"
  - "scor 4C"
  - "run an audit"
  - "how's my setup"
  - "what am I missing"
  - "4C score"
  - "check my AIOS"
negative_triggers:
  - "audit a client"
  - "security audit"
  - "code audit"
modes:
  - full (default): audit complet cu toti 6 pasi + loop optional de revizie
  - quick: scor + top gap, fara save, folosit de morning routine
  - force: forteaza recalculare ignorand cache-ul
context_loads:
  - context/USER.md (reads)
  - brand/voice.md (reads)
  - brand/audience.md (reads)
  - brand/positioning.md (reads)
  - brand/samples.md (reads)
  - context/priorities.md (reads)
  - connections.md (reads)
  - context/learnings.md (reads)
  - data/audit-cache.json (reads, writes)
inputs:
  - mode (optional: "full" | "quick" | "force", default "full")
outputs:
  - context/audits/{YYYY-MM-DD}.md
  - data/audit-cache.json (cache cu mtime hash)
  - Terminal report cu scor si recomandari
---

# Step 0: Cache check

Inainte de orice scanare, verifica cache-ul. Skip pasul daca `mode = force`.

1. Citeste `data/audit-cache.json` daca exista. Format asteptat:
   ```json
   {
     "score": 73,
     "pillars": {"context": 22, "connections": 11, "capabilities": 18, "cadence": 22},
     "label": "Strong",
     "top_gaps": [...],
     "computed_at": "2026-05-05T08:14:22Z",
     "input_hash": "a1b2c3..."
   }
   ```

2. Calculeaza `current_hash`: concateneaza `mtime.toISOString()` pentru fiecare input:
   - `context/USER.md`, `brand/voice.md`, `brand/audience.md`, `brand/positioning.md`, `brand/samples.md`
   - `context/priorities.md`, `connections.md`, `context/learnings.md`, `.env`
   - Plus listing-ul (count + sorted names) pentru `skills/`, `cron/jobs/`, `context/memory/`, `context/audits/`

   Hash = SHA-256 al concatenarii. Pentru fisiere care lipsesc, foloseste string-ul "missing".

3. Daca `current_hash === cache.input_hash` SI `Date.now() - cache.computed_at < 24h`:
   - **Cache HIT**: foloseste valorile din cache pentru Step 2 si urmatoarele
   - In quick mode: outputeaza direct one-liner-ul cu scor si nota "(cached)"
   - In full mode: continua de la Step 3 cu scorul si pillar-ele cached

4. Altfel cache MISS sau expirate → procedeaza normal de la Step 1.

# Quick Mode Gate

Daca e quick mode (morning routine sau explicit):
1. Daca cache HIT → afiseaza scorul cached cu "(cached)" si STOP
2. Daca cache MISS → ruleaza Step 1+2, scrie cache nou, afiseaza one-liner si STOP
3. Format: `"4C: {score}/100 ({label}) | Top gap: {nume} ({pillar}/25)"`
4. Daca scorul a scazut fata de ultimul audit din `context/audits/`: adauga ` ⚠ -{delta} vs {data}`
5. NU rulezi Steps 3-7. NU salvezi fisier de audit nou.

Pentru full mode, continua mai jos.

---

# Step 1: Scan Project State

Read the following files silently (do not output their contents). For each, determine if it has real content or is an empty template/placeholder:

**Context pillar:**
- `context/USER.md` -- has name and business? (0 = missing/placeholder, 5 = filled)
- `brand/voice.md` -- has real tone/vocabulary? (0 = template comments only, 5 = personalized)
- `brand/audience.md` -- has real demographics/pain points? (0 = template, 5 = real)
- `brand/positioning.md` -- has real one-liner/differentiators? (0 = template, 5 = real)
- `context/priorities.md` -- exists with current quarter goals? (0 = missing, 5 = filled)

**Connections pillar:**
Scan `connections.md` (if exists) and `.env` for API keys. Count how many of the 7 tier-1 domains are covered:
- Revenue (Stripe, QuickBooks, payment tools)
- Customer (CRM, support, community)
- Calendar (Google Calendar, Calendly)
- Comms (email, Slack, messaging)
- Tasks (ClickUp, Notion, Linear, project management)
- Meetings (Fireflies, Otter, transcription)
- Knowledge (Drive, local files, wikis)

Score: `min(domains_covered * 3.5, 25)`. Round to nearest integer. Minimum 0, maximum 25.

Also check `.env` for non-empty API keys (FIRECRAWL, OPENAI, XAI, YOUTUBE, GEMINI). Each active key = +1 to connections score (up to the 25 cap).

**Capabilities pillar:**
- Count installed skills in `skills/` (exclude `_catalog/`): each = 2 points, max 20
- Check `context/learnings.md` for per-skill entries (any real feedback logged?): +5 if yes
- Cap at 25

**Cadence pillar:**
- Any cron jobs in `cron/jobs/`? (0 = no, 8 = yes with active jobs)
- Any memory files in `context/memory/` from last 7 days? (0 = no, 7 = yes)
- Is there a `context/audits/` directory with previous audits? (0 = no, 5 = yes)
- Has `sys-session-close` been run recently (check last memory file for session close pattern)? (0 = no, 5 = yes)
- Cap at 25

# Step 2: Calculate Score

Add up all four pillars. Total score is out of 100.

Apply these labels:
- 0-20: **Getting started** -- run /onboard first
- 21-40: **Foundation laid** -- focus on connections and personalization
- 41-60: **Growing** -- build custom skills and set up cadence
- 61-80: **Strong** -- optimize, add clients, automate recurring work
- 81-100: **Operating** -- you're running a real AIOS

# Step 3: Identify Top 3 Gaps

For each pillar below max, calculate the gap (25 - actual). Rank by gap size (largest first). For the top 3:

1. Name the gap
2. Explain why it matters (one sentence)
3. Give a concrete next step (exact command or action)

Example gap format:
```
Gap #1: Connections (4/25)
Why: Without tool access, your AIOS can only work with what you paste in manually.
Fix: Pick your most-used tool and connect it. Start with: "Help me connect {tool} via API"
```

# Step 4: Compare to Previous Audit

Check `context/audits/` for previous audit files. If one exists:
- Show score delta: "Score: 58/100 (+12 since last audit on {date})"
- Highlight which pillar improved most
- Note if any pillar regressed

If no previous audit exists, skip comparison.

# Step 5: Save Audit

Write the full audit to `context/audits/{YYYY-MM-DD}.md`:

```markdown
# robOS Audit - {YYYY-MM-DD}

## Score: {total}/100 ({label})

| Pillar | Score | Details |
|--------|-------|---------|
| Context | {n}/25 | {what's filled vs missing} |
| Connections | {n}/25 | {domains covered, keys active} |
| Capabilities | {n}/25 | {skills installed, learnings active} |
| Cadence | {n}/25 | {cron jobs, memory recency, session patterns} |

## Top Gaps
1. {gap 1 with fix}
2. {gap 2 with fix}
3. {gap 3 with fix}

## Changes Since Last Audit
{delta or "First audit"}
```

Create `context/audits/` directory if it doesn't exist.

# Step 6: Print Report + Cache Write

Output scorul si top 3 gaps in terminal. Pastreaza-l concis — detaliile complete sunt in fisierul salvat.

Inainte de output, scrie `data/audit-cache.json`:

```json
{
  "score": {total},
  "pillars": { "context": N, "connections": N, "capabilities": N, "cadence": N },
  "label": "{label}",
  "top_gaps": [...],
  "computed_at": "{now ISO}",
  "input_hash": "{hash calculat la Step 0}"
}
```

Cache-ul TTL e 24h. Invalidare automata cand orice input file se modifica (mtime hash).

End cu: "Scor: {total}/100. Vrei sa repar gap-ul #1 acum? (spune **fix it**) Sau: /level-up pentru oportunitati, /daily-plan pentru plan de zi."

---

# Step 7: Revision Loop (Triggered by "fix it" or "repara")

If the user responds with "fix it", "repara", "da", or "yes" after seeing the report:

## Iteration 1

1. Take Gap #1 from the report
2. Execute its "Fix" action:
   - If the fix is "fill a file" (e.g., brand/voice.md is empty): ask the minimum questions needed to populate it, then write
   - If the fix is "connect a tool": guide through .env setup for that specific tool
   - If the fix is "install a skill": run `bash scripts/add-skill.sh {name}`
   - If the fix requires information only the user has: ask ONE focused question, then act on the answer
3. After the fix: re-scan ONLY the affected pillar (not full audit)
4. Report delta: "{Pillar}: {old}/25 -> {new}/25 (+{diff})"
5. If improved: "Gap #1 adresat. Trecem la gap #2?"

## Iteration 2-3 (if user continues)

Repeat for gap #2, then #3. Same process.

## Stall Detection

If after an iteration the affected pillar score did NOT increase:
- Do NOT retry the same fix with a different approach
- Say: "Acest gap necesita actiuni manuale pe care nu le pot face acum (ex: creare cont API, scriere samples reale). Am logat in Open Threads."
- Log to today's memory under Open Threads: "sys-audit gap #{n}: {description} - needs manual action"
- Move to next gap or stop

## Hard Limits

- Maximum 3 iterations per session (even if user wants more)
- After iteration 3: "Am adresat 3 gaps. Ruleaza /audit maine sa vezi progresul complet."
- Never loop without user confirmation between iterations
- Never re-run the same fix twice in one session
