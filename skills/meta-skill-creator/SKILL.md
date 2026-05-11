---
name: meta-skill-creator
version: 1.0.0
category: meta
description: "Creeaza skill-uri noi, modifica si imbunatateste skill-uri existente, masoara performance. Pentru: create skill from scratch, edit/optimize existing, run evals, benchmark cu variance analysis, optimize description pentru triggering accuracy."
triggers:
  - "creeaza skill cu eval"
  - "skill creator cu benchmark"
  - "build skill"
  - "improve skill"
  - "edit skill"
  - "optimize skill"
  - "eval skill"
  - "benchmark skill"
  - "skill creator"
  - "create new skill"
  - "skill from scratch"
negative_triggers:
  - "creeaza system"
  - "system package"
  - "PACKAGE.yaml"
context_loads:
  - context/learnings.md (section meta-skill-creator)
  - skills/_index.json (registry skill-uri existente)
inputs:
  - intent (required: ce skill vrei sau ce skill vrei sa modifici)
  - mode (optional: create | edit | eval | benchmark | optimize, auto-detectat)
outputs:
  - skills/{new-skill-name}/SKILL.md (create mode)
  - Update SKILL.md existent (edit mode)
  - Eval report (eval/benchmark modes)
tier: core
---

# Skill Creator

Skill pentru a crea skill-uri noi si pentru a le imbunatati iterativ.

Process la high level:
- Decide ce vrea sa faca skill-ul si rough how
- Scrie draft
- Creeaza cateva test prompts si ruleaza Claude-cu-acces-la-skill pe ele
- Ajuta user-ul sa evalueze rezultate calitativ + cantitativ
- Rewrite skill pe baza feedback
- Repeat pana satisfacut
- Expand test set si try larger scale

# Job-ul tau

Cand user invoca acest skill, identifica unde e in proces si ajuta-l sa progreseze.

Exemple:
- "Vreau sa fac un skill pentru X" → ajuta sa rafineze, scrie draft, creeaza tests, evalueaza, ruleaza prompts, repeta
- "Am draft skill" → mers direct la eval/iterate
- "Just vibe with me" → flexible, NU forta evals

# Comunicare cu user

User-ii vin cu nivele variate de familiaritate technica. Pay attention la context cues:

- "evaluation" si "benchmark" — borderline, OK
- "JSON" si "assertion" — verifica cues serioase ca user stie aceste concepte inainte sa folosesti fara explicare
- "linter" / "stack trace" — confirma intelegere inainte de a folosi terminology

Default: explicit, no jargon shortcuts.

# Step 1: Capture intent

Intreaba user:
- Ce face skill-ul? (output, NU implementare)
- Cine il foloseste? (operator / orchestrator pipeline)
- Cand se trigger-eaza? (user phrase typical)
- Ce input primeste? Ce output produce?

Skip questions evidente din input.

# Step 2: Ecosystem awareness

Scaneaza `skills/` pentru skill-uri existente similar:
- Daca exista pereche → propune extend acelasi skill (NU create paralel)
- Daca exista skill-uri related → reuse-uri posibile (declare in dependencies)
- Daca gap real → continue cu create

Prezinta findings la user inainte sa scrii cod.

# Step 3: Draft SKILL.md

Citeste `references/canonical-template.md` (sectiune order canonical):
1. Frontmatter (name, version, category, description, triggers, negative_triggers, context_loads, inputs, outputs, secrets, runtime_dependencies, tier)
2. Outcome — ce produce skill-ul concret
3. Context Needs — tabel cu ce citeste
4. Dependencies — tabel cu alte skill-uri
5. Steps — numbered, actionable
6. Rules — guardrails
7. Self-Update — protocol corectie
8. Troubleshooting — common issues

# Step 4: Test prompts

Creeaza 3-5 test prompts care exercite skill-ul. Ruleaza Claude-cu-skill-ul pe fiecare in `Agent` invocations paralele.

# Step 5: Eval

Doua perspective:
- **Calitativ** (user judges) — ruleaza `eval-viewer/generate_review.py` (daca exista in skill) sa arati outputs side-by-side
- **Cantitativ** (assertions) — daca skill produce structured output, scrie assertions JSON

Variance analysis: ruleaza 3x acelasi prompt → check variance in output. High variance = skill underdetermined.

# Step 6: Iterate

Pe baza eval feedback, rewrite skill. Tipic schimbari:
- Tightening prompts (mai specific)
- Adding rules
- Adjusting context_loads
- Refining triggers (negative_triggers cand misfires)

# Step 7: Description optimization

Ruleaza `scripts/improve_description.py` (daca exista) sa optimizezi `description:` field pentru trigger accuracy. Asta ajuta routing-ul cand multiple skill-uri sunt candidate.

# Rules

- **Mereu ecosystem awareness** inainte de create — NU duplicate work
- **Triggers RO+EN bilingual** — robOS standard
- **Tier mapping**: assigneaza explicit (core/content-creator/video-producer/social-publisher/researcher)
- **Variance high** = skill needs more constraints (rules / context_loads)

# Self-Update

Daca user-ul flag-eaza issue — skill prost generat, missing context loads, tier wrong — actualizeaza `# Rules`.
