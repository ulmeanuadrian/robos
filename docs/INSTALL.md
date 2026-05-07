# Cum instalezi robOS — de la zero la primul prompt

Ghidul complet pentru cineva care n-a mai folosit Claude Code sau robOS pana acum.
Daca ai deja Node.js + Claude Code instalate, sari direct la **Pasul 1**.

---

## Cerinte minime de sistem

- Mac (Intel sau Apple Silicon), Windows 10/11, sau Linux
- 4 GB RAM minim, 8 GB+ recomandat
- ~500 MB liber pe disk dupa instalare

---

## Pas 0 — Aplicatii prerequisite

robOS are nevoie de doua aplicatii instalate **inainte** sa-l deschizi.

### 0a. Node.js v20 sau mai nou *(gratuit)*

Verificare rapida in terminal:

```
node --version
```

Daca vezi `v20.x.x` sau mai sus, ai. Sari la **0b**.

Daca nu ai sau ai versiune mai veche:

- **Windows**: deschide [nodejs.org](https://nodejs.org), descarca **LTS** (butonul verde mare),
  ruleaza installer-ul `.msi` → click Next pana la final → restart terminal.
- **Mac**:
  - Simplu: [nodejs.org](https://nodejs.org) → descarca LTS `.pkg` → ruleaza installer-ul.
  - Cu nvm (recomandat daca lucrezi cu mai multe versiuni Node):
    ```
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    ```
    Restart terminal, apoi:
    ```
    nvm install 20
    nvm use 20
    ```
- **Linux (Ubuntu/Debian)**:
  ```
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install nodejs
  ```

Verifica din nou: `node --version` → `v20.x.x`.

### 0b. Claude Code CLI *(necesita cont Anthropic)*

Verificare rapida:

```
claude --version
```

Daca raspunde, ai. Sari la **Pas 1**.

Daca nu ai:

- **Mac/Linux**:
  ```
  curl -fsSL https://claude.ai/install.sh | sh
  ```
- **Windows** (PowerShell):
  ```
  irm https://claude.ai/install.ps1 | iex
  ```

Apoi ruleaza `claude` in terminal — te logheaza prima data cu contul tau Anthropic.

**N-ai cont Anthropic?** Creeaza-l la [claude.ai](https://claude.ai). robOS merge cu orice plan
(Pro / Max / Team / Enterprise / API direct) — diferenta e doar cat folosesti.

---

## Pas 1 — Cumpara robOS

Mergi la [robos.vip](https://robos.vip), apesi pe **Vreau robOS — €197**, completezi formularul de
plata. Dupa confirmare primesti un email cu un buton mare **Descarca robOS**.

Linkul de download e:

- **Unic pentru tine** (legat de licenta ta)
- **Valabil 7 zile** de la emitere (cere-mi link nou daca expira)
- **Multi-use** — il poti folosi de mai multe ori in cele 7 zile (ex: re-descarci dupa reinstall OS)

---

## Pas 2 — Descarca si dezarhiveaza

Click pe buton → primesti `robos-0.5.0.tar.gz` (~300 KB).

Dezarhiveaza-l:

- **Mac**: dublu-click pe fisier in Finder. Apare folder `robOS/`.
- **Linux**: dublu-click in file manager, sau `tar xzf robos-0.5.0.tar.gz` in terminal.
- **Windows**:
  - Dublu-click pe `.tar.gz` → daca Windows nu stie sa-l deschida nativ, instaleaza
    [7-Zip](https://www.7-zip.org/) (gratuit) sau foloseste:
    ```
    tar -xzf robos-0.5.0.tar.gz
    ```
    (tar e built-in pe Windows 10/11.)

Muta folderul `robOS/` unde vrei. Recomand:

- Mac/Linux: `~/robOS` (in home directory)
- Windows: `C:\robOS` (path scurt, fara spatii — mai usor de debugat)

Eviti path-uri cu spatii sau caractere speciale ("Documents", "OneDrive", etc.) — e prost setup-ul
pentru orice tool linie de comanda.

---

## Pas 3 — Lansezi robOS (o singura comanda)

Deschide terminal in folder `robOS/`:

- **Mac**: deschide Terminal, ruleaza `cd ~/robOS`
- **Linux**: la fel
- **Windows**: deschide PowerShell sau Command Prompt, ruleaza `cd C:\robOS`

Apoi ruleaza launcher-ul:

| OS | Comanda |
|---|---|
| Mac/Linux | `bash scripts/robos` |
| Windows (cmd) | `scripts\robos.cmd` |
| Windows (PowerShell) | `.\scripts\robos.ps1` |
| Universal | `node scripts/robos.js` |

Launcher-ul face automat la prima rulare (1-2 minute):
1. Verifica Node + Claude CLI
2. Instaleaza dependinte (`npm install`)
3. Build-uieste dashboard-ul (Astro)
4. Initializeaza baza de date SQLite cu schema completa (`data/robos.db`)
5. Creeaza `.env` din template + auto-genereaza ROBOS_DASHBOARD_TOKEN
6. Genereaza index-ul de skills (22 skills, 206 triggers)
7. Porneste dashboard-ul la `http://localhost:3001`
8. Deschide automat browser-ul

La rulari ulterioare (warm), launcher-ul detecteaza dashboard-ul activ si doar redeschide browser-ul (~200ms).

**Optional**: pentru a putea lansa `robos` din orice director:
```
node scripts/robos.js --install-shortcut
```
(adauga alias in `~/.zshrc` / `~/.bashrc` / PowerShell `$PROFILE`)

---

## Pas 4 — Lansezi Claude Code

In **alta fereastra de terminal**, in acelasi folder `robOS/`:

```
claude
```

Claude Code se deschide. La **primul prompt** pe care-l trimiti, robOS isi activeaza singur licenta
in fundal (~400ms). Daca ai conexiune la internet, e invizibil. Daca nu, vezi mesaj sa te conectezi.

Dupa primul bind, robOS valideaza licenta **offline** la fiecare prompt urmator (~5ms, zero net).
Refresh automat la 60 zile din 90.

---

## Pas 5 — Onboarding (~15 minute)

Cu Claude Code deschis, scrie:

```
onboard me
```

Claude te ghideaza prin 5 intrebari:

1. **Cine esti** — nume, business, ce faci intr-o propozitie
2. **Cum scrii** — lipesti 1-2 lucruri pe care le-ai scris recent (email, post, articol). NU edita.
   Vrea vocea ta reala. Folosit pentru a-ti calibra brand voice.
3. **Prioritati** — 2-3 obiective pentru urmatoarele 90 zile
4. **Tools** — ce folosesti zilnic (email, calendar, project management, CRM, social, analytics)
5. **Prima automatizare** — o sarcina repetitiva pe care ai vrea s-o predai

Dupa raspunsuri, **3 agenti paraleli** genereaza in fundal `brand/voice.md`, `brand/audience.md`,
`brand/positioning.md` — personalizat pe samples-urile tale, nu generic.

La final, Claude ruleaza un skill ca **"first win"** — vezi un rezultat real personalizat in
primele 15 minute.

---

## Pas 6 — Dashboard local *(deja pornit la Pas 3)*

Dashboard-ul e deja activ la [http://localhost:3001](http://localhost:3001) — l-a pornit launcher-ul
la Pasul 3. Niciun login, ruleaza local pe 127.0.0.1.

8 tab-uri: Acasa, Task-uri, Program (cron), Skills, Analitice, Fisiere, Sistem, Setari.

Stop dashboard cand termini ziua:
```
node scripts/robos.js --stop
```

Status oricand:
```
node scripts/robos.js --status
```

---

## Folosirea zilnica — triggere principale

robOS asculta in romana. Cele mai folosite:

| Trigger | Ce face |
|---|---|
| `plan de zi` | Iti planifica ziua cu 3 prioritati |
| `morning routine` | Plan de zi + audit combinat |
| `audit` | Scor 4C peste setup-ul tau (0-100) |
| `level up` | Ce sa automatizezi urmator |
| `scrie un articol despre X` | Blog post in vocea ta |
| `cum stau cu X` | Progress check pe un thread |
| `done` | Inchide sesiunea, salveaza memoria zilei |

Lista completa: `skills/_index.json` sau dashboard-ul tab Skills.

---

## Probleme frecvente

### `node` nu e recunoscut
Sari la **Pasul 0a** — instaleaza Node.js v20+.

### `claude` nu e recunoscut
Sari la **Pasul 0b** — instaleaza Claude Code CLI.

### Setup-ul esueaza la `npm install`
Conexiune lenta sau cazuta. Sterge `centre/node_modules` si reincearca:
```
rm -rf centre/node_modules
node scripts/setup.js
```

### `Activarea licentei a esuat: license_not_found`
Linkul de download e legat de licenta ta — ai dezarhivat alt fisier sau a expirat? Cere-mi link
nou: adrian@robos.vip.

### `robOS are nevoie de conexiune la internet la prima rulare`
Conecteaza-te la net si reincearca primul prompt. Activarea se face online doar o data; dupa aceea
robOS merge offline.

### Hardware mismatch dupa schimbat laptop
Scrie-mi la adrian@robos.vip — fac rebind manual la noul hardware.

### Setup-ul merge dar `claude` da eroare la primul prompt
Probabil e o eroare de Claude Code, nu de robOS. Ruleaza `claude --version` si verifica ca te-ai
logat corect (`claude` te intreaba la prima rulare).

### Vrei sa testezi din nou onboarding-ul de la zero
Sterge `brand/voice.md`, `brand/audience.md`, `brand/positioning.md`, `context/USER.md` si scrie
din nou `onboard me`. (Tip: fa o copie a folder-ului robOS inainte sa incepi, ca backup.)

---

## Probleme rare / suport

Daca nimic din mai sus nu rezolva, scrie-mi: **adrian@robos.vip** sau pe WhatsApp (numarul e in
welcome email-ul tau).

Cand scrii, include:
- OS-ul tau (Mac/Windows/Linux + versiunea)
- `node --version` si `claude --version`
- Output-ul exact al erorii (screenshot e ok)
- La ce pas ai esuat

---

## Cum updatezi robOS

Versiunile minore (0.5.1, 0.5.2, ...) si patch-urile sunt **gratuite** — bug fixes + imbunatatiri
incrementale. La un viitor `v1.0` major, te anunt prin email cu pasii de upgrade.

**Update in-place** (recomandat):

```
node scripts/update.js
```

Asta:
1. Verifica versiunea curenta vs server
2. Daca exista update, cere confirmare
3. Backup user content in `data/.update-backup/{timestamp}/`
4. Descarca tarball nou autentificat cu JWT-ul tau
5. Aplica preservand `brand/`, `context/`, `projects/`, `clients/`, `cron/jobs/`, `data/`, `.env`
6. Restarteaza dashboard-ul daca rula

Pe Windows poti folosi `scripts\update.cmd` sau `.\scripts\update.ps1`.

**Datele tale sunt in siguranta**: niciun fisier user (brand, memorie, projects, .env, DB) NU e atins.
