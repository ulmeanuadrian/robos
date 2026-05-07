# Claude (singur) vs Claude + robOS

robOS nu inlocuieste Claude. E un layer deasupra. Tabelul de mai jos arata ce face Claude bine din start, si ce adauga robOS la fiecare capacitate.

```
+---------------------------------+----------------------------------------------------+
| Claude (singur) e maestru la:   | robOS adauga deasupra:                             |
+---------------------------------+----------------------------------------------------+
| Reasoning + decizii adanci      | Deciziile se salveaza automat ca note candidates   |
| in conversatie                  | (Stop hook detecteaza pattern-uri "Decizie:" /     |
|                                 | "Regula:" / "Important:"). Confirmate batch la     |
|                                 | sesiunea urmatoare. SQLite FTS5 index, full-text   |
|                                 | recall ranked BM25 — "ai mai notat despre X" da    |
|                                 | top-K rezultate cu snippets.                       |
+---------------------------------+----------------------------------------------------+
| Generare cod, scriere,          | Editeaza direct fisierele din repo-ul instalat,    |
| editare fisiere                 | nu copy-paste din chat. Output-urile (memorie,     |
|                                 | brand, clients, projects) sunt fisiere locale pe   |
|                                 | disk-ul tau, separabile si exportabile oricand.    |
+---------------------------------+----------------------------------------------------+
| Foloseste tool-uri              | Skill router: limbaj natural matchat deterministic |
| (Read, Edit, Bash, Grep, etc.)  | la 22 skills out-of-the-box (3 brand, 3 content,   |
|                                 | 2 research, 10 sys, 3 mode, 1 tool). Total 206     |
|                                 | trigger-uri RO + EN. "scrie un articol" / "audit"  |
|                                 | / "level up" — fara slash commands, fara config.   |
+---------------------------------+----------------------------------------------------+
| Long-context comprehension      | Activity log captureaza fiecare turn end via       |
| in interiorul UNEI sesiuni      | Stop hook (NDJSON, rotation 500 entries). Cross-   |
| (1M tokens)                     | session bridge: alta fereastra, alt client, ieri,  |
|                                 | saptamana trecuta — robOS stie ce ai facut.        |
+---------------------------------+----------------------------------------------------+
| Adapteaza ton + stil            | Voce de brand auto-incarcata per client. 6         |
| la cerere                       | dimensiuni (tone, vocabular, ritm, personalitate,  |
|                                 | format, never-do list) salvate in fisier pe disk.  |
|                                 | Acelasi Claude — suna ca brand-ul tau de fiecare   |
|                                 | data, fara reaminteala manuala.                    |
+---------------------------------+----------------------------------------------------+
| Memorie in interiorul UNEI      | Hook-uri care impun protocoale runtime, nu doar    |
| conversatii                     | recomanda. Stop hook iti reaminteste sa salvezi    |
|                                 | memoria; ignori 3 ori → blocheaza inchiderea pana  |
|                                 | scrii. UserPromptSubmit injecteaza tacit context-  |
|                                 | ul la primul prompt — Claude vine la lucru deja    |
|                                 | stiind unde ai ramas.                              |
+---------------------------------+----------------------------------------------------+
| Genereaza pe baza de prompt     | Cron jobs deterministe (bypass Claude, 0 cost      |
| (token-ate per request)         | token) — audit-uri zilnice, validari, agregari     |
|                                 | saptamanale. Plus cron leader lock — nu se         |
|                                 | dubleaza job-urile cand UI + daemon ruleaza.       |
|                                 | [SILENT] suppression: monitoring jobs care         |
|                                 | raporteaza "all clear" nu trimit notification.     |
+---------------------------------+----------------------------------------------------+
| Raspunde la fiecare prompt      | UserPromptSubmit hook injecteaza tacit memoria     |
| ca o sesiune separata           | zilei + open threads + activity recent + skill     |
|                                 | router hint la fiecare start de sesiune. Niciun    |
|                                 | re-explain, niciun "ai uitat ce am facut".         |
+---------------------------------+----------------------------------------------------+
| Multi-context-switch in chat    | clients/ workspace-uri izolate per client. Schimbi |
| (incarci fisiere manual)        | clientul cu o comanda — vocea, audienta,           |
|                                 | pozitionarea, jurnalul lui — totul se aliniaza     |
|                                 | singur. Zero per-seat licensing — costul e fix.    |
+---------------------------------+----------------------------------------------------+
| Chat web frumos, no-code        | Dashboard local pe http://localhost:3001 (Astro    |
|                                 | + Svelte, cold start ~300ms). 8 tab-uri: Acasa,    |
|                                 | Task-uri, Program (cron), Skills, Analitice (cost  |
|                                 | per skill), Fisiere, Sistem (activity / audituri / |
|                                 | memorie / learnings / connections), Setari.        |
|                                 | Bind 127.0.0.1 default — datele tale, nu in cloud. |
+---------------------------------+----------------------------------------------------+
| Reasoning fara structura        | Concurrency framework — 5 patterns standardizate   |
| pentru work paralel             | (Pillar Fan-Out, MapReduce Research, Multi-Asset   |
|                                 | Generation, Multi-Angle Creativity, Adversarial    |
|                                 | Synthesis). 8 skills paralelizate intern, castig   |
|                                 | 3-5x wall-clock. Telemetrie obligatorie per run    |
|                                 | in data/skill-telemetry.ndjson.                    |
+---------------------------------+----------------------------------------------------+
```

## Ce NOU adauga v0.5

- **Launcher unic** — comanda `robos` (sau `scripts\robos.cmd` / `node scripts/robos.js`) face setup-if-needed → start dashboard → open browser intr-un singur pas. Cold start ~0.7s, warm reuse ~0.2s.
- **Update in-place** — `node scripts/update.js` verifica versiunea, descarca tarball nou autentificat cu JWT-ul tau, aplica preservand brand/, context/, projects/, .env (ZERO touch user data).
- **Verification discipline** — Shadow Mode (verifica strict inainte de generare), Calibration Indicator (3 intrebari de auto-evaluare la final task non-trivial), Confidence Tagging (HIGH/MEDIUM/LOW per claim tehnic).
- **Cross-platform notifications** — node-notifier optional + fallback OS-native (osascript / notify-send / PowerShell BurntToast).

## Ce inseamna asta concret

Claude (singur) e excelent pentru:
- Sesiuni single-shot, intrebari rapide
- Brainstorming si analiza
- Cod generat la cerere intr-o conversatie
- Lucrul cu 1-3 proiecte personale (Cowork acopera asta)

robOS adauga valoare reala cand:
- Lucrezi cu **5+ clienti** (multi-client, cost fix, fara per-seat)
- Memoria **trebuie sa supravietuiasca** sesiuni / zile / saptamani
- Ai **protocoale** de respectat (audit zilnic, brand voice, validari pre-publish)
- Vrei **datele tale** la tine, in fisiere markdown locale, exportabile (nu in cloud Anthropic)
- Operezi un workflow **repetabil** (content production, research, automation)
- Vrei **decizii cumulative** (note candidates → confirmate → cautate via FTS5)

Claude singur e ascutitul cutitelor. robOS e bucataria.

## Asta NU inlocuieste Claude

Toate aceste capabilities depind de Claude pentru reasoning + generation. robOS e un harness — fara Claude in spate, e gol.

Concret: **robOS = Claude Code + filesystem layer + skill registry + cron + hooks de protocol + dashboard + second brain.**

Daca nu folosesti Claude, robOS nu functioneaza. Daca folosesti Claude doar pentru chat-uri scurte, robOS e overkill. Daca operezi cu el zilnic pe deliverables structurate, robOS e ce-ti lipseste.

---

**Versiune doc:** 2.0 (rescris pe v0.5.0, claims verificate la cod)
**Acopera robOS:** v0.5.x
