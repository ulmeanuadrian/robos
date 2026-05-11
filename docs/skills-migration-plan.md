# Skills Migration Plan — `.claude/skills/` → `skills/`

**Status:** APPROVED 2026-05-11 by operator
**Scope:** Aducere a tuturor celor 33 skill-uri din `.claude/skills/` in pachetul robOS (`skills/`), cu standardizare la conventia native si rezolvarea celor 6 conflicte critice.
**Constraint:** Zero studenti instalati (clean slate). Putem face breaking changes libere pe `skills/`.

---

## Decizii strategice (LOCKED)

| Intrebare | Decizie | Implicatii |
|---|---|---|
| Overlap-uri (6 perechi) | **Merge** — robOS canonical pastreaza numele, preia feature-urile bune din `.claude` | Numele robOS supravietuiesc; functionalitatea expanded |
| Categorii noi | **4 noi adaugate** in robOS: `00-`, `viz-`, `vid-`, `meta-` | Update `skill-frontmatter.js`, AGENTS.md, dashboard filters |
| Modelul de install | **Categoriile alese la onboarding** (lean install) | Onboarding wizard intreaba ce face studentul → instaleaza skill-urile relevante |
| Limba | **Full RO pass** pe text user-facing din SKILL.md | Triggers raman bilingv (RO+EN), cod si JSON raman EN |

---

## Inventarul final (57 skill-uri net)

### A. Skill-uri robOS native existente (24 — raman, unele primesc merge)

| Skill | Status | Note |
|---|---|---|
| `brand-voice` | **MERGE** | Preia: Playbook mode, auto-scrape din `mkt-brand-voice` |
| `brand-audience` | **MERGE** | Preia: research methods, interview-questions.md din `mkt-icp` |
| `brand-positioning` | **MERGE** | Preia: competitive search, market sophistication din `mkt-positioning` |
| `content-blog-post` | KEEP | |
| `content-copywriting` | KEEP | |
| `content-repurpose` | **MERGE** | Preia: 8-16 platforme, algorithm checks, calendar din `mkt-content-repurposing` |
| `mode-anti-dependence` | KEEP | |
| `mode-facilitator` | KEEP | |
| `mode-shadow` | KEEP | |
| `research-competitors` | KEEP | |
| `research-trending` | **MERGE** | Preia: Python last30days.py, OpenAI Reddit + xAI integration din `str-trending-research` |
| `sys-audit` | KEEP | |
| `sys-capture-note` | KEEP | |
| `sys-daily-plan` | KEEP | |
| `sys-goal-breakdown` | KEEP | |
| `sys-level-up` | KEEP | |
| `sys-onboard` | UPDATE | Adaugare flow tiered install (intreaba ce categorii vrea studentul) |
| `sys-recall` | KEEP | |
| `sys-session-close` | KEEP | |
| `sys-session-open` | KEEP | |
| `sys-skill-builder` | KEEP | |
| `sys-switch-client` | KEEP | |
| `tool-humanizer` | **MERGE** | Preia feature-uri din `.claude/skills/tool-humanizer` daca exista (verificare necesara) |

### B. Skill-uri portate net din `.claude/skills/` (27 — adaugate noi)

#### B1. Orchestratori (`00-` — categoria noua, **4 skill-uri**)
| Skill | Dependencies | Triggers RO |
|---|---|---|
| `00-longform-to-shortform` | vid-clip-selection, vid-clip-extractor, tool-transcription, vid-ffmpeg-edit, mkt-short-form-posting, tool-zernio-social | "pipeline complet video", "youtube la shorts" |
| `00-slides` | viz-frontend-slides, research-trending (opt) | "creeaza prezentare", "slides despre" |
| `00-social-content` | brand-voice, content-repurpose, research-trending, tool-humanizer, tool-linkedin-scraper, tool-publisher, tool-transcription, tool-web-screenshot, tool-youtube, viz-image-gen | "ruleaza social content", "genereaza post" |
| `00-youtube-to-ebook` | tool-youtube, tool-video-screenshots, mkt-longform-article, tool-fact-checker, tool-humanizer, tool-pdf-generator | "youtube la ebook", "video la pdf" |

#### B2. Tool-uri (`tool-` — extindere, **11 skill-uri noi**)
| Skill | Dependencies runtime | Secrets |
|---|---|---|
| `tool-fact-checker` | — | — |
| `tool-linkedin-scraper` | Python | `APIFY_API_KEY` (required) |
| `tool-pdf-generator` | Python, pandoc sau weasyprint | — |
| `tool-publisher` | MCP Zernio | `ZERNIO_API_KEY` (required) |
| `tool-screenshot-annotator` | Python | — |
| `tool-transcription` | Python, ffmpeg, WhisperX (via uv) | `GROQ_API_KEY` (opt) |
| `tool-video-screenshots` | Python, ffmpeg | — |
| `tool-video-upload` | HandBrake sau ffmpeg, MCP Zernio | `ZERNIO_API_KEY` (required) |
| `tool-web-screenshot` | Python, Playwright | `SCREENSHOTONE_API_KEY` (opt) |
| `tool-youtube` | Python, yt-dlp | `YOUTUBE_API_KEY` (opt) |
| `tool-zernio-social` | MCP Zernio | `ZERNIO_API_KEY` (required) |

#### B3. Marketing (`mkt-` — extindere, **4 skill-uri noi**)
| Skill | Dependencies | Secrets |
|---|---|---|
| `mkt-content-analytics` | MCP Zernio | `ZERNIO_API_KEY` (required) |
| `mkt-longform-article` | brand-voice context | — |
| `mkt-short-form-posting` | tool-transcription, tool-video-upload, tool-zernio-social | `ZERNIO_API_KEY` |
| `mkt-youtube-content-package` | tool-transcription, tool-video-upload, tool-zernio-social | `ZERNIO_API_KEY` |

#### B4. Video (`vid-` — categoria noua, **3 skill-uri noi**)
| Skill | Dependencies |
|---|---|
| `vid-clip-extractor` | Python, OpenCV DNN (ResNet-10 SSD models), ffmpeg |
| `vid-clip-selection` | Python |
| `vid-ffmpeg-edit` | Python, ffmpeg, viz-image-gen (opt) |

#### B5. Visualization (`viz-` — categoria noua, **4 skill-uri noi**)
| Skill | Dependencies | Secrets |
|---|---|---|
| `viz-excalidraw-diagram` | Python, Playwright Chromium | — |
| `viz-frontend-slides` | — | — |
| `viz-hyperframes` | Node.js, `npx hyperframes` | — |
| `viz-image-gen` | Python | `OPENAI_API_KEY` sau `GOOGLE_GEMINI_API_KEY` |

#### B6. Meta (`meta-` — categoria noua, **2 skill-uri noi**)
| Skill | Note |
|---|---|
| `meta-skill-creator` | Suprapunere cu `sys-skill-builder` (robOS) — investigare necesara, posibil merge ulterior |
| `meta-skill-system-creator` | Creeaza system packages (multi-skill) — unic |

### C. Skill-uri droppate (1 — `tool-humanizer` din `.claude` se topeste in robOS canonical)

---

## Tier mapping (pentru tiered install la onboarding)

Onboarding-ul intreaba: **"Ce faci?"** si bifeaza:

### Core (mereu instalat — fara dependencies grele)
- Toate `sys-*` (12 skill-uri)
- Toate `mode-*` (3 skill-uri)
- `brand-voice`, `brand-audience`, `brand-positioning` (merged)
- `content-blog-post`, `content-copywriting`, `content-repurpose` (merged)
- `research-trending` (merged — mode WebSearch fallback fara API keys), `research-competitors`
- `tool-humanizer` (canonical robOS)
- `tool-fact-checker`
- `meta-skill-creator`, `meta-skill-system-creator`

**Total Core: ~26 skill-uri. Cere doar Node.js (deja required).**

### Content Creator (opt-in la onboarding — "fac content video/audio")
- `tool-youtube`, `tool-transcription`, `tool-web-screenshot`, `tool-pdf-generator`
- `tool-video-screenshots`, `tool-screenshot-annotator`, `tool-linkedin-scraper`
- `mkt-longform-article`, `mkt-content-analytics`
- `viz-image-gen`, `viz-excalidraw-diagram`, `viz-frontend-slides`
- `00-slides`, `00-youtube-to-ebook`, `00-social-content`

**Adauga: ~15 skill-uri. Cere: Python 3.11+, ffmpeg, pandoc, Playwright Chromium, WhisperX (uv).**

### Video Producer (opt-in — "produc video shorts")
- `vid-clip-extractor`, `vid-clip-selection`, `vid-ffmpeg-edit`
- `viz-hyperframes`
- `00-longform-to-shortform`

**Adauga: ~5 skill-uri. Cere: Python + OpenCV DNN models, ffmpeg, HandBrake, Node.js hyperframes, possibly NVENC GPU acceleration.**

### Social Publisher (opt-in — "public pe LinkedIn/IG/TikTok")
- `tool-zernio-social`, `tool-video-upload`, `tool-publisher`
- `mkt-short-form-posting`, `mkt-youtube-content-package`

**Adauga: ~5 skill-uri. Cere: Cont Zernio (`ZERNIO_API_KEY`).**

### Researcher (opt-in — "fac research adanc")
- (research-trending si research-competitors deja in Core; tier-ul asta enable API keys pentru depth)
- Configurari: `OPENAI_API_KEY`, `XAI_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_API_KEY`

**Tier-uri se pot combina.** Default install: Core only.

---

## Convetia robOS aplicata la fiecare skill portat

### Frontmatter standard (LOCKED)

```yaml
---
name: {prefix}-{slug}
version: 1.0.0
category: {brand|content|mode|research|sys|tool|00|viz|vid|meta}
description: "..."  # max 150 chars, RO
triggers:
  - "trigger in romana 1"
  - "trigger in romana 2"
  - "English trigger 1"
  - "English trigger 2"
negative_triggers:
  - "..."  # cand e overlap cu alt skill
context_loads:
  - brand/voice.md (reads)
  - context/learnings.md (section {skill-name})
  - projects/{skill-name}/ (writes)
inputs:
  - {name} ({required|optional}): description
outputs:
  - projects/{skill-name}/{YYYY-MM-DD}/{slug}/ (artifacts: ...)
secrets_required:
  - SECRET_NAME
secrets_optional:
  - SECRET_NAME
runtime_dependencies:  # NOU — declar explicit ce tool-uri externe cere
  - python: ">=3.11"
  - ffmpeg
  - "pandoc OR weasyprint"
tier: {core|content-creator|video-producer|social-publisher|researcher}
---
```

### Path-uri standard

| Vechi (`.claude/skills/`) | Nou (robOS) | Note |
|---|---|---|
| `{brand_context}/voice-profile.md` | `brand/voice.md` | rezolvat via `resolveContextPath()` |
| `{brand_context}/icp.md` | `brand/audience.md` | |
| `{brand_context}/positioning.md` | `brand/positioning.md` | |
| `{brand_context}/samples.md` | `brand/samples.md` | |
| `{brand_context}/assets.md` | `brand/assets.md` | NOU in robOS — adaugare la skills brand-* |
| `{brand_context}/design-tokens.md` | `brand/design-tokens.md` | NOU in robOS — cere skill nou `brand-design-tokens` (port din .claude) |
| `{projects_base}/skill/{YYYY-MM-DD}/{slug}/` | `projects/{skill}/{YYYY-MM-DD}/{slug}/` | rezolvat via `getProjectsDir()` |
| `~/Downloads/{file}` | `getDownloadsPath()/{file}` | helper nou portabil (Windows/macOS/Linux) |
| `c:\claude_os\robos` hardcoded | `{decoupled_base}` din `sys-config.md` | strip hardcoded paths |

### Multi-client awareness

Toate skill-urile portate trebuie sa cheme `resolveContextPath()` cand citesc/scriu in:
- `brand/*`
- `context/USER.md`, `context/learnings.md`, `context/memory/`
- `projects/*`

Skill-urile globale (toate `meta-*`, `sys-skill-builder`, `00-*` orchestratori) ignora active-client.

### Limba

- **SKILL.md body text** (Outcome, Steps, error messages user-facing): RO
- **Triggers**: bilingv (3-4 RO + 3-4 EN)
- **Frontmatter description**: RO
- **Pseudo-code, JSON examples, file paths, comments in scripts**: EN
- **Tool argument names, function names**: EN
- **Operator-facing prompts in scripts (`bash scripts/*.sh`)**: RO (existing convention)

---

## Faze de executie (ordine garantata)

### Faza 0 — Snapshot si branch (15 min)

1. Commit current state to main (snapshot)
2. Create branch `feat/skills-migration`
3. Toate batch-urile lucreaza pe acest branch

### Faza 1 — Foundation upgrades (2-3h, BLOCKING)

1. Extinde `scripts/lib/skill-frontmatter.js`:
   - Adauga categorii valide: `00`, `viz`, `vid`, `meta`
   - Adauga campuri noi: `runtime_dependencies`, `tier`
2. Extinde `scripts/skill-route.js` cu collision detection (fail loud pe duplicate triggers)
3. Adauga helper `scripts/lib/portable-paths.js` cu `getDownloadsPath()`
4. Update `scripts/lib/client-context.js` daca trebuie path-uri noi
5. Update `scripts/rebuild-index.js` sa scrie noile campuri in `_index.json`
6. Smoke test: `node scripts/smoke-skills.js` (nou)

### Faza 2 — Resolve 6 overlaps (4-6h)

Per skill: identifica feature-urile noi din `.claude`, merge in robOS canonical, update frontmatter, smoke test.

1. `brand-voice` ← `mkt-brand-voice`
2. `brand-audience` ← `mkt-icp`
3. `brand-positioning` ← `mkt-positioning`
4. `content-repurpose` ← `mkt-content-repurposing`
5. `research-trending` ← `str-trending-research`
6. `tool-humanizer` — verifica diff, merge daca .claude are extras, altfel skip

Dupa fiecare merge: smoke + commit atomic.

### Faza 3 — Port leaf tools (8-10h)

11 tool-* skill-uri (sunt frunze in DAG-ul dependintelor):

Per skill (~45 min):
- Mut folderul din `.claude/skills/{name}/` in `skills/{name}/`
- Rescrie SKILL.md cu frontmatter robOS
- Tradu user-facing in RO
- Migrare paths (brand_context→brand, etc.)
- Adauga `resolveContextPath()` daca scrie in per-client locations
- Adauga `secrets_required` / `secrets_optional`
- Migrare scripts: `skill-pack/` → `skills/{name}/lib/`
- Update path-uri Python sa accepte args (nu hardcode)
- Smoke test: `rebuild-index.js` passes
- Commit atomic

### Faza 4 — Port viz-* si vid-* (5-6h)

7 skill-uri leaf:
- `viz-frontend-slides`, `viz-image-gen`, `viz-excalidraw-diagram`, `viz-hyperframes`
- `vid-clip-selection`, `vid-clip-extractor`, `vid-ffmpeg-edit`

### Faza 5 — Port mkt-* (3-4h)

4 skill-uri:
- `mkt-content-analytics`, `mkt-longform-article`, `mkt-short-form-posting`, `mkt-youtube-content-package`

### Faza 6 — Port 00-* orchestratori (4-5h)

4 orchestratori — depinde de tool-* deja portate:
- `00-slides`, `00-youtube-to-ebook`, `00-social-content`, `00-longform-to-shortform`

### Faza 7 — Port meta-* (2-3h)

2 skill-uri:
- `meta-skill-creator` (decide daca merge cu `sys-skill-builder` sau coexista)
- `meta-skill-system-creator`

### Faza 8 — Tiered onboarding (3-4h)

1. Update `sys-onboard/SKILL.md`: adauga sectiune tier selection
2. Update `scripts/setup-env.js`: tier-aware (cere doar API keys de la tier-urile selectate)
3. Update `setup.cmd` / `setup.sh`: invoca `setup-python.sh` daca tier-urile cer Python
4. `scripts/setup-python.{sh,cmd,ps1}` nou: verifica Python 3.11+, instaleaza pip deps per tier

### Faza 9 — Tooling integration (3-4h)

1. `.env.example`: adauga noile slot-uri (ZERNIO, OPENAI, YOUTUBE, GROQ, FIRECRAWL, APIFY, SCREENSHOTONE, XAI, GEMINI)
2. `.mcp.example.json`: adauga Zernio MCP config template
3. `centre/` (dashboard): adauga categorii noi in Skills tab filter
4. `connections.md`: documenteaza Zernio, Apify, OpenAI APIs

### Faza 10 — Validation suite (2-3h)

1. `scripts/smoke-skills.js` nou: per skill verifica frontmatter, paths resolvable, no trigger collisions, secrets declared
2. `scripts/smoke-migration.js` nou: rebuild-index passes, all skills load, no missing dependencies
3. Run full smoke
4. Manual test per categorie: invoke o data fiecare tier, verifica output

### Faza 11 — Documentation (2-3h)

1. `AGENTS.md`: update tabel categorii, model recommendations, tier description
2. `CLAUDE.md`: update workflow-uri noi
3. `docs/instalare-student.md`: update flow tiered install
4. `README.md`: update inventar skill-uri
5. `WHATS-NEW.md`: bump version, list new skills

### Faza 12 — Cleanup (30 min)

1. `rm -rf .claude/skills/` (skill-urile sunt acum in `skills/`)
2. Update `.gitignore` daca trebuie
3. Final commit + merge `feat/skills-migration` in main

---

## Validare per skill (checklist)

Inainte sa marc un skill ca DONE:

- [ ] Frontmatter valid (`rebuild-index.js` passes fara warn)
- [ ] Triggers nu coliziona (verificat de `skill-route.js` collision detection)
- [ ] Paths folosesc helpers (no hardcoded `c:\claude_os\robos`, `~/Downloads`)
- [ ] Multi-client aware (`resolveContextPath` daca aplicabil)
- [ ] Secrets declarate (`secrets_required` / `secrets_optional`)
- [ ] Runtime deps declarate (`runtime_dependencies`)
- [ ] Tier mapped (`tier: core` sau alt tier)
- [ ] Limba RO pe user-facing text
- [ ] Smoke test rulat
- [ ] Commit atomic

---

## Riscuri si mitigari

| Risc | Mitigare |
|---|---|
| Python 3.11+ missing pe Windows | `setup-python.cmd` verifica + ofera link winget |
| ffmpeg missing | `setup-python.cmd` instaleaza via winget |
| `playwright chromium` lipsa | Skill cheama `playwright install chromium` la prima rulare |
| Zernio API down | Skill da friendly error + fallback la draft mode |
| Coliziune trigger | `rebuild-index.js` aruncă WARN, CI smoke fails build |
| Multi-client + skill nou nesicronizat | Smoke test cu client activ verifica path resolution |
| Onboarding overwhelm | Tier selection cu defaults sensible (Core only la prima rulare) |
| Dependencies break update | `update.cmd` ruleaza `setup-python.cmd --verify` |

---

## Estimare totala

- **Faza 0+1:** 3h (foundation)
- **Faza 2:** 6h (overlaps)
- **Faza 3-7:** 22h (porting)
- **Faza 8-9:** 7h (tooling)
- **Faza 10-12:** 7h (validation + docs)
- **Total:** ~45h

Daca lucrez 4-6h/sesiune → **8-10 sesiuni**.

---

## Cum follow-up

Per sesiune:
1. Read `docs/skills-migration-plan.md` (acest fisier)
2. Check status TodoWrite — care batch e in progress
3. Continue de unde am ramas
4. Update plan-ul daca apar decizii noi

Plan-ul e living document. Daca apare conflict neprevazut, **update aici prima**, apoi execute.
