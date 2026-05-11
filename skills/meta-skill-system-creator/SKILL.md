---
name: meta-skill-system-creator
version: 1.0.0
category: meta
description: "Creeaza skill systems — packages multi-skill care lant-uiesc skill-uri in workflows complete. Deep interview, scaneaza skill-uri existente pentru reuse, handle PACKAGE.yaml manifests, install.sh scripts, output directory conventions, template rendering."
triggers:
  - "creeaza system"
  - "package skill-urile astea"
  - "build skill system"
  - "transforma in system"
  - "system din skill-uri"
  - "create a system"
  - "package these skills"
  - "build a skill system"
  - "turn this into a system"
  - "system from skills"
negative_triggers:
  - "creeaza skill"
  - "single skill"
context_loads:
  - context/learnings.md (section meta-skill-system-creator)
  - skills/_index.json (registry skill-uri existente)
  - AGENTS.md (System Registry section)
inputs:
  - system_intent (required: ce face systemul, ce workflow lant-uieste)
outputs:
  - skills/_systems/{system-name}/PACKAGE.yaml
  - skills/_systems/{system-name}/install.sh
  - skills/_systems/{system-name}/skills/ (skill folders)
  - skills/_systems/{system-name}/agents/ (sub-agents)
tier: core
---

# Skill System Creator

Transforma un set de skill-uri related intr-un skill system distribuibil — package self-contained care installeaza skill-uri, framework files, templates, assets in orice robOS instance.

# Outcome

Package complet la `skills/_systems/{system-name}/`:
- `PACKAGE.yaml` — manifest cu skill-uri, services, prerequisites
- `install.sh` — installer cu fresh + existing-project modes
- `agents/` — sub-agent definitions (deployed la `.claude/agents/`)
- `skills/` — skill folders cu entry skill containing `skill-pack/` (config, tools, templates, assets, vendor libs)

Installed via `bash scripts/add-system.sh {name}`. Removed via `bash scripts/remove-system.sh {name}`.

# Step 0: System Interview

Inainte sa identifici skill-uri sau scrii cod, interview complet:

**Phase 1 — Big Picture** (2-4 Qs):
- Ce face acest system?
- Ce il trigger-eaza? (user input typical)
- Ce intra? Ce iese?

**Phase 2 — Process Deep-Dive** (5-12 Qs):
- Walk fiecare phase
- Map human-in-the-loop checkpoints
- Identifica error states + recovery

**Phase 3 — Ecosystem Scan** (automat):
- Scan `skills/` + `brand/` pentru reuse candidates
- Prezinta reuse map: ce exista vs ce trebuie construit
- **Critical**: NICIODATA default la building from scratch. Show user ce exista deja, create skill-uri noi DOAR pentru gap-uri reale.

**Phase 4 — Edge Cases** (3-5 Qs):
- Failure modes
- Minimum inputs (sub care abandoneaza)
- Abort conditions (cand user-ul vrea sa cancel)

**Phase 5 — Confirmation**:
- Sumarizeaza specul complet
- Get user sign-off inainte sa continui

# Step 1: Skill Identification

Pe baza specului:
- **Reuse**: skill-uri existente care satisfac un phase
- **Build new**: skill-uri lipsa care merita create separat
- **Orchestrator**: skill-ul `00-*` care coordoneaza fluxul

NU mass-create skill-uri noi. Prefera reuse.

# Step 2: PACKAGE.yaml

Manifest declarativ:

```yaml
name: {system-name}
version: 1.0.0
description: ...
entry_skill: 00-{system-name}
skills:
  required:
    - 00-{system-name}
    - tool-X
    - mkt-Y
  optional:
    - viz-Z
agents:
  - ssc-{system-name}-helper
services:
  required:
    - ZERNIO_API_KEY
  optional:
    - FIRECRAWL_API_KEY
prerequisites:
  - python: ">=3.11"
  - ffmpeg
output_dir: projects/{system-name}
```

# Step 3: install.sh

Script bash idempotent care:
1. Copy skill folders din `skills/_systems/{name}/skills/` → `skills/`
2. Copy agents → `.claude/agents/`
3. Rule `node scripts/rebuild-index.js` (re-genereaza _index.json)
4. Check prerequisites (`python3 --version`, `command -v ffmpeg`)
5. Warn pentru lipsa secrets (NU block — informational)
6. Report success cu summary

Read `references/install-template.sh` pentru template.

# Step 4: Skills + skill-pack

Pentru orice skill NOU created (NU reuse):
- Folder `skills/_systems/{name}/skills/{skill-name}/`
- `SKILL.md` cu frontmatter standard robOS
- `skill-pack/` cu config, tools, templates (daca system are setup specific)

Entry skill (00-*) are obligatoriu `skill-pack/config/sys-config.md` cu Paths section pentru install.sh sa populeze.

# Step 5: Agents (sub-agent definitions)

Daca system are sub-agents specifici, creeaza `.claude/agents/ssc-{name}-helper.md` cu specializare clara.

NU folosi general-purpose agents in workflow-uri repetitive — specialized agents = better consistency.

# Step 6: Templates + assets

Daca system genereaza output din templates:
- `skills/_systems/{name}/skills/00-{name}/skill-pack/templates/` — markdown templates
- `skills/_systems/{name}/skills/00-{name}/skill-pack/assets/` — static files

Install.sh copy-le la output_dir cand fresh install.

# Step 7: Documentation

Update `AGENTS.md` → System Registry section:
```markdown
## Systems

| System | Entry skill | Purpose |
|--------|-------------|---------|
| social-content | 00-social-content | Auto-generate posts cross-platform |
| {new} | 00-{new} | ... |
```

# Rules

- **Ecosystem scan PRIMUL** — NICIODATA build-from-scratch fara verifyi reuse-uri
- **Reuse > Build new** — fiecare skill nou justifica de ce nu reuse-uiesc existing
- **install.sh idempotent** — running de 2x nu strica nimic
- **Specialized agents pentru workflows repetitive** — NU general-purpose

# Self-Update

Daca user-ul flag-eaza issue — system specu incomplete, install fail, reuse missed — actualizeaza `# Rules`.
