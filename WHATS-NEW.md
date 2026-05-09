# Ce e nou in robOS

Schimbarile importante explicate pentru tine ca operator, nu ca developer.
Pentru detalii tehnice complete vezi [CHANGELOG.md](CHANGELOG.md) (developer-facing).

---

## v2.1.0 — Stabilitate, securitate, Windows parity

### Ce castigi

**Toggle-urile din `.env` chiar functioneaza acum.**
Inainte, daca puneai `ROBOS_LOOP_DETECTOR_DISABLED=1` in `.env`, nu se intampla
nimic — hook-urile nu citeau `.env`. Acum citesc. Daca vrei sa dezactivezi loop
detector / activity capture / checkpoint reminder, schimbi `.env` si gata.

**Multi-client cu adevarat.**
Inainte, daca aveai un client activ si lasai sesiunea sa expire 2h, robOS o
considera fals "abandonata" si afisa avertismente la urmatoarea sesiune. Acum
detector-ul vede memoria pe TOATE scope-urile (root + fiecare client), deci
clasifica corect.

**Pachetul ruleaza pe Windows fara WSL.**
Daca esti pe Windows si nu ai bash/Git Bash, scripturile zilnice de management
(client nou, skill nou, status crons) functioneaza acum. Foloseste:
- `scripts\add-client.cmd acme-corp` (sau `.ps1` din PowerShell)
- `scripts\list-skills.cmd`
- `scripts\add-skill.cmd <nume>`
- `scripts\status-crons.cmd`

Pe Mac/Linux comenzile vechi (`bash scripts/...sh`) functioneaza identic.
Universal: `node scripts/add-client.js acme-corp` merge oriunde ai Node.

**Mesaje de eroare aliniate la realitate.**
Inainte, instalatorii Windows ziceau "Node >= 20" dar setup-ul real esua pe Node
20 cu o eroare obscura din Astro. Acum toate scripturile zic clar
**Node >= 22.12.0** si te trimit la `.msi` direct daca n-ai winget.

**Securitate intarita la dashboard.**
- Dashboard-ul nu mai accepta cereri fara header `Origin` (un proces local
  malicios nu mai poate fura token-ul).
- `.env.bak` e creat cu permisiuni explicite restrictive (intent documentat
  pe POSIX, ACL pe Windows).
- Cron jobs ruleaza fara shell — metacaracterele shell (`&&`, `|`) nu mai
  pot fi interpretate.

**Mai putine surprize la scara.**
- `data/session-state/` se curata automat (>30 zile).
- `data/session-recovery/` se curata automat (>7 zile).
- Atomic writes au retry pe Windows EBUSY (fisier blocat de editor) — nu
  mai pierzi scrieri silentios.

**Catalog-ul de skill-uri e onest.**
Inainte, 6 skill-uri instalate lipseau din catalog. Acum e 1:1 pentru toate
23 instalate.

### Ce nu mai functioneaza (daca depindeai)

**`ROBOS_DEV=1` a fost scos.**
Daca foloseai escape-ul ca sa skip-uiesti license check in test envs, acum
trebuie sa generezi o licenta proaspata via dashboard admin si s-o copiezi
in `.license-stamp` din test folder INAINTE de setup. Vezi
`scripts/test-env/README.md`.

**`docs/init/` a fost mutat.**
Acel folder continea continut de la un produs diferit ("Agentic OS" — nimic
de-a face cu robOS). E in `.archive/legacy-vendor-docs/` acum, gitignored
(local-only). Niciun student nu primea acel continut oricum (era gitignored).

### Ce ramane neschimbat

- API-ul skills (trigger-uri, frontmatter, output paths) e identic.
- Comenzile zilnice principale (`onboard me`, `audit`, `noteaza asta`,
  `gata`) merg la fel.
- Memoria zilnica si learnings.md sunt protejate la update.
- Brand files (`brand/*.md`) sunt protejate la update.

### Cum primesti acest update

Daca rulezi v2.0.0:
```bash
node scripts/update.js
```

Update-ul nu atinge `.env`, `brand/`, `clients/`, `context/notes/`,
`context/USER.md`, `context/learnings.md` sau memoria zilnica.

---

## Versiuni anterioare

### v2.0.0 — Loop Detector + jump versiune

A introdus Loop Detector ca hook PostToolUse (te scapa de cazurile cand model-ul
incearca sa citeasca acelasi fisier de 50 ori in loop). Salt de la 0.6 la 2.0
ca semnal ca produsul e stable, nu beta.

Vezi [CHANGELOG.md](CHANGELOG.md) pentru detalii tehnice.

### v0.6.0 — Multi-client real

A activat workspace-uri multi-client izolate. Fiecare client are brand, context,
memory, projects separate. Comuti intre clienti cu o fraza ("trec pe clientul
acme-corp").

### v0.5.x — Bearer auth + per-client memory

Securitate dashboard cu Bearer token + Origin check. Memorie zilnica per client.

---

**Pentru schimbari complete cu fisiere si linii de cod, vezi
[CHANGELOG.md](CHANGELOG.md).**
