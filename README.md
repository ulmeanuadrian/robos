# robOS

Transforma Claude Code in sistemul tau operativ agentic.

robOS da lui Claude Code memorie persistenta de brand, metodologii de skill-uri testate, automatizare programata si un centru de comanda vizual. Functioneaza ca un partener de business care iti cunoaste vocea, audienta si fluxul de lucru -- din prima zi.

---

## Start rapid

```bash
git clone https://<TOKEN>@github.com/your-org/robos.git
cd robos
bash scripts/setup.sh
bash scripts/start.sh
```

Setup-ul verifica sistemul, instaleaza dependentele (~30 secunde) si pune doua intrebari: numele tau si business-ul tau. Apoi deschide `http://localhost:3000` -- esti gata.

La prima pornire, dashboard-ul detecteaza ca esti nou si te ghideaza prin construirea fundatiei de brand: voce, audienta si pozitionare.

---

## Ce primesti

### 1. Memorie de brand care te urmareste peste tot

Claude Projects functioneaza doar pe claude.ai. Contextul de brand robOS functioneaza pe orice suprafata Claude -- CLI, VS Code, Desktop, Web. Profilul de voce, audienta si pozitionarea se incarca automat in fiecare sesiune.

### 2. Metodologii de skill-uri testate

Claude Code are infrastructura de skill-uri. robOS o umple cu procese testate. Skill-ul de copywriting nu doar "scrie copy" -- urmeaza un framework, incarca vocea de brand, noteaza output-ul pe 7 dimensiuni si elimina pattern-urile AI automat.

**16 skill-uri pre-instalate:**

| Skill | Ce face |
|-------|---------|
| `sys-onboard` | Onboarding interactiv in 15 min (starter pack + interviu + first win) |
| `sys-audit` | Scor 4C (Context/Connections/Capabilities/Cadence) din 100 |
| `sys-daily-plan` | Planificare zilnica din memorie + prioritati |
| `sys-level-up` | 5 intrebari ca sa gasesti ce sa automatizezi |
| `brand-voice` | Extrage sau construieste vocea de brand (4 moduri) |
| `brand-audience` | Defineste clientul ideal prin interviu sau research |
| `brand-positioning` | Gaseste unghiul care te diferentiaza |
| `content-blog-post` | Articole SEO cu keyword research si humanizer |
| `content-copywriting` | Copy persuasiv cu scoring pe 7 dimensiuni |
| `content-repurpose` | Un continut -> posturi native pt 8 platforme |
| `research-trending` | Trenduri din Reddit, X, HN, YouTube (ultimele 30 zile) |
| `research-competitors` | Analiza competitori: mesaje, preturi, diferentiere |
| `tool-humanizer` | Sterge 10 tipuri de pattern-uri AI din text |
| `sys-skill-builder` | Creeaza skill-uri custom pentru business-ul tau |
| `sys-session-close` | Captura de memorie si feedback la sfarsit de sesiune |
| `sys-goal-breakdown` | Sparge obiective in task-uri pe 3 nivele de complexitate |

**11 skill-uri aditionale** disponibile in catalog (email sequences, newsletter, keyword research, case study, landing page si altele).

### 3. Invatare per skill

Feedback-ul se acumuleaza per skill, nu intr-un blob generic. Corectiile la output-ul de copywriting nu polueaza skill-ul de SEO. Dupa 30 de zile, fiecare skill e masurabil mai bun decat in prima zi.

### 4. Centru de comanda vizual

Un dashboard lightweight (Astro + Svelte, < 80KB JS) care iti arata totul dintr-o privire:

| Tab | Ce arata |
|-----|----------|
| **Home** | Task-uri active, coada de review, activitate recenta, sanatatea sistemului |
| **Tasks** | Board Kanban (Backlog, Active, Review, Done) cu detalii slide-out |
| **Schedule** | Job-uri cron cu istoric rulari, cost per rulare, pauza/reluare |
| **Skills** | Skill-uri instalate + catalog cu cele disponibile |
| **Files** | Browse context/, brand/, projects/ -- citeste orice fisier |
| **Settings** | Variabile de mediu, config MCP, setari Claude |

Cold start: sub 300ms. Fara dev server -- asset-uri statice built pentru productie.

### 5. Automatizare programata

Defineste job-uri ca fisiere JSON in `cron/jobs/`. Scheduler-ul le ruleaza headless prin `claude -p` si urmareste rezultatele in dashboard.

```json
{
  "name": "daily-research",
  "schedule": "0 9 * * 1-5",
  "skill": "research-trending",
  "args": {"topic": "AI automation"},
  "enabled": true
}
```

Gestioneaza din dashboard sau CLI:
```bash
bash scripts/start-crons.sh    # porneste scheduler-ul
bash scripts/status-crons.sh   # verifica ce ruleaza
bash scripts/stop-crons.sh     # opreste programarea
```

### 6. Clienti multipli

Fiecare client primeste context de brand izolat, memorie, proiecte si job-uri programate. Zero contaminare incrucisata.

```bash
bash scripts/add-client.sh "Acme Corp"
cd clients/acme-corp && claude
```

Schimba clientul din dropdown-ul dashboard-ului sau navigand in alt director.

---

## Cum functioneaza

**Claude Code e unde lucrezi. Dashboard-ul e unde vezi si controlezi.**

```
Tu (terminal)               Dashboard (browser)
     |                           |
     v                           v
  claude                   localhost:3000
     |                           |
     +--- citeste CLAUDE.md -----+--- arata status
     |    citeste brand/         |    arata task-uri
     |    foloseste skills/      |    gestioneaza cron
     |    scrie in projects/     |    browse fisiere
     |    scrie in memory/       |    editeaza setari
     |                           |
     +------ filesystem comun ---+
```

Dashboard-ul urmareste filesystem-ul pentru schimbari. Cand Claude scrie un fisier, dashboard-ul il preia. Cand creezi un job cron in dashboard, scheduler-ul il ruleaza prin Claude CLI.

---

## Structura fisierelor

```
robos/
  context/
    SOUL.md              Personalitatea agentului
    USER.md              Profilul tau (generat la setup)
    priorities.md        Prioritati trimestriale
    learnings.md         Acumulare feedback per skill
    audits/              Istoric scoruri 4C
    memory/              Jurnale zilnice de sesiune
  brand/
    voice.md             Profil voce de brand (6 dimensiuni)
    audience.md          Profil client ideal
    positioning.md       Unghiuri de diferentiere
    samples.md           Exemple de continut
  connections.md         Inventar tool-uri conectate (7 domenii)
  skills/                Pachete de skill-uri instalate
  projects/              Tot output-ul generat
  cron/jobs/             Definitii job-uri programate
  clients/               Workspace-uri multi-client
  centre/                Aplicatia dashboard (Astro + Svelte)
  scripts/               Setup, start, update, management
  CLAUDE.md              Instructiuni pentru Claude Code
  AGENTS.md              Reguli comune ale proiectului
```

---

## Gestionare skill-uri

```bash
bash scripts/list-skills.sh                    # vezi instalate + disponibile
bash scripts/add-skill.sh content-copywriting  # instaleaza din catalog
bash scripts/remove-skill.sh content-seo       # sterge un skill
```

Sau din dashboard: tab-ul Skills > catalog > Instaleaza.

---

## Actualizare

```bash
bash scripts/update.sh
```

Descarca cele mai noi skill-uri, metodologii si imbunatatiri ale dashboard-ului. Contextul de brand, memoria, proiectele si cheile API nu sunt niciodata suprascrise.

Daca un skill pe care l-ai personalizat are schimbari upstream, vei vedea un diff si alegi per-skill: accepti upstream sau pastrezi al tau.

---

## Chei API

Majoritatea skill-urilor functioneaza fara chei API. Unele sunt imbunatatite cu servicii externe. Toate cheile merg in `.env`.

```bash
cat .env.example    # vezi cheile disponibile cu descrieri
```

Skill-urile iti spun cand ar putea folosi o cheie si ofera intotdeauna un fallback.

---

## Datele tale sunt in siguranta

Nu sunt niciodata suprascrise de update-uri:
- `brand/` -- vocea, audienta, pozitionarea ta
- `context/` -- memoria, learnings, istoricul sesiunilor
- `projects/` -- tot ce a fost generat pentru tine
- `clients/` -- toate workspace-urile de client
- `.env` -- cheile tale API (gitignored)

---

## Stack tehnic

- **Dashboard**: Astro 5 + Svelte 5 islands + Tailwind 4
- **Baza de date**: SQLite (better-sqlite3, WAL mode)
- **Server**: Node.js production server (nu dev server)
- **Programare**: croner library
- **Update-uri live**: Server-Sent Events (SSE)

---

Construit de RoboMarketing
