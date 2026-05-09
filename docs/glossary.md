# Glossary — termeni robOS

Termeni care apar in docs / dashboard / outputs si nu sunt evidenti pentru un operator nou.
Romanian-first; English alternative in paranteze unde e cazul.

---

## Conceptual

**Skill** — pachet de instructiuni cu trigger-uri. Cand spui ceva care matcheaza un
trigger, model-ul executa skill-ul (citeste `SKILL.md` + face pasii). Lista
in `skills/` (instalate) si `skills/_catalog/` (disponibile).

**Hook** — script care ruleaza automat la evenimente Claude Code (UserPromptSubmit,
PostToolUse, Stop). Diferit de skill: hook-ul nu e cerut de tine — porneste in fundal.

**Cron job** — task programat care ruleaza la intervale (zilnic, saptamanal). Definit
in `cron/defaults/*.json`; executat de scheduler-ul in-process din dashboard.

**Trigger** — cuvant sau fraza care declanseaza un skill. Ex: "audit", "noteaza asta",
"plan de zi". Lista completa: `node scripts/robos.js --triggers <kw>`.

**Operator** — tu, persoana care foloseste robOS. Termen folosit pentru ca robOS e
single-user (nu multi-tenant — e personal).

**Operator-Peer** — audienta tinta a robOS: profesionisti care folosesc AI peer-to-peer
(nu novice, nu cor de developeri). SMB owners, consultanti, agency-owners.

**Memorie zilnica** — fisier markdown la `context/memory/YYYY-MM-DD.md` cu sectiunile
Goal / Deliverables / Decisions / Open Threads. Auto-actualizat de hook-uri si la
session close.

**Active client** — workspace-ul curent. Cand setezi un client (`trec pe clientul X`),
toate skill-urile rezolva `brand/`, `context/USER.md`, `context/memory/` din
`clients/{slug}/`. Set/show: `data/active-client.json`.

**Starter pack** — set de template-uri brand (voice/audience/positioning) pre-populate
pentru un tip de business. Folosit la onboarding ca punct de plecare. 6 packs:
consultant, agency, ecommerce, creator, smb, b2b-saas.

---

## Audit + verification (din OM-AI Protocol)

**Shadow Mode** — comutator cognitiv: model-ul NU rescrie / NU genereaza continut nou.
Listeaza inconsistente, presupuneri, lipsuri, intrebari. Folosit ca verification gate
inainte de generare. Trigger: "shadow mode", "verifica strict".

**Anti-Dependence Mode** — comutator cognitiv: inainte sa propun solutii, intreb
operatorul ce ar face el. Previne atrofia cognitiva. Trigger: "anti-dependence".

**Facilitator Mode** — comutator cognitiv: in loc sa propun solutii, pun 3-5 intrebari
structurate pentru a clarifica gandirea. Trigger: "facilitator mode".

**Calibration Indicator** — gate de auto-verificare la sfarsitul unui task non-trivial:
3 intrebari (pot explica in 3 pasi? mi s-a schimbat gandirea? am principiu+exemplu?).

**Confidence Tagging** — la fiecare claim tehnic: HIGH (verified cu tool in sesiunea
curenta), MEDIUM (training data, neverificat), LOW (incert, trebuie verificat).

**4C Audit** — scoring de la 0 la 100 pe 4 dimensiuni: **C**ontext (cat de bine
cunoaste robOS user-ul + business-ul), **C**onnections (cate tool-uri sunt active),
**C**apabilities (cat skill coverage), **C**adence (cat de des folosesti robOS).

---

## Tehnic

**Loop Detector** — hook PostToolUse care detecteaza cand model-ul face acelasi tool
call de N ori (default 3). Injecteaza `[LOOP DETECTOR]` warning in context. Toggle:
`ROBOS_LOOP_DETECTOR_DISABLED=1` in `.env`.

**Bearer auth** — schema HTTP de autentificare cu token. robOS dashboard-ul cere
`Authorization: Bearer <token>` pentru endpoint-uri sensitive. Token-ul auto-generat
la `setup-env.js`, salvat in `.env` ca `ROBOS_DASHBOARD_TOKEN`.

**JWT (license)** — JSON Web Token semnat Ed25519 care reprezinta licenta robOS.
Salvat la `~/.robos/license.jwt` dupa primul bind reusit. Verificat offline (~5ms)
la fiecare prompt.

**Hardware bind** — la prima rulare, robOS salveaza un hash al hardware-ului
(MAC + CPU + hostname) in JWT. Rulare ulterioara verifica match. Schimb laptop →
rebind manual via admin@robos.vip.

**Hook-errors sink** — fisier NDJSON la `data/hook-errors.ndjson` unde toate
erorile silentioase ale hook-urilor se logheaza. Inspectie: `node scripts/robos.js --doctor`
arata ultimele 3 entries.

**Activity log** — fisier NDJSON la `data/activity-log.ndjson` cu turn-urile
recente (user prompt + assistant summary, redactate). Folosit pentru cross-session
memory bridge — Claude la urmatoarea sesiune vede ce s-a intamplat ieri.

**Telemetry** — fisier NDJSON la `data/skill-telemetry.ndjson` unde skill-urile
paralelizate scriu metricele lor (agents, wall_clock_ms, fallback_used). Folosit
pentru weekly review (fallback >20% = bug).

---

## Concurrency patterns (pentru skill builders)

**Pillar Fan-Out** — N agenti paraleli, fiecare pe o dimensiune; un reducer
sintetizeaza. Ex: `sys-audit` pe 4 piloni 4C.

**MapReduce Research** — N agenti paraleli, fiecare pe o sursa; synthesizer merge
+ dedupe. Ex: `research-trending` pe 5 surse, `research-competitors` pe N
competitori.

**Multi-Asset Generation** — N agenti paraleli, fiecare cu un format de output
diferit. Ex: `content-repurpose` (8 platforme).

**Multi-Angle Creativity** — 3 agenti paraleli cu prompturi stilistic diferite.
Ex: `content-blog-post mode=options`.

**Adversarial Synthesis** — agenti PRO / CONTRA / ALT + synthesizer cu trade-off
matrix. Ex: `sys-level-up`.

---

## Sigle / ABV

| Sigla | Sensus | Note |
|-------|--------|------|
| ICP | Ideal Customer Profile | Audienta tinta concreta |
| USP | Unique Selling Proposition | Diferentiator unic |
| SMB | Small/Medium Business | Sub 500 angajati, sub $50M ARR |
| ARR | Annual Recurring Revenue | Pentru SaaS / abonamente |
| MRR | Monthly Recurring Revenue | ARR / 12 |
| LTV | Lifetime Value | Pentru calcul CAC payback |
| CAC | Customer Acquisition Cost | |
| CTA | Call To Action | "Cumpara acum" / "Inscrie-te" |
| CTR | Click-Through Rate | |
| RCE | Remote Code Execution | Termen security |
| CSRF | Cross-Site Request Forgery | Browser malicios → API |
| BOM | Byte Order Mark | UTF-8 prefix invizibil (uneori) |
| FTS | Full-Text Search | SQLite FTS5 in robos.db |
| NDJSON | Newline-Delimited JSON | Format log un-record-per-line |

---

## Status indicators

| Marker | Sens |
|--------|------|
| `[OK]` | Verde — operatie reusita |
| `[FAIL]` | Rosu — operatie esuata |
| `[..]` | Cyan — operatie in progres |
| `[!!]` | Galben — avertisment, dar continui |
| `[SKIP]` | Gri — sarit (nu necesar) |
| `[LOOP DETECTOR]` | Warning model-side cand acelasi tool e apelat repetat |
| `[ACTIVE CLIENT: slug]` | Banner injectat de hook cand un client e activ |
