# Decision Journal

> Append-only registru cu decizii non-triviale, propuneri AI, alegeri ale operatorului si ce am invatat. Format dupa Meta-Decision Journal din OM-AI Protocol.
>
> Se scrie aici dupa: hallucinations corectate, decizii strategice, audituri cu corectii, schimbari de protocol. NU pentru Q&A trivial sau munca de zi cu zi (jurnalul zilei e in `context/memory/`).

---

## Format

Fiecare entry are 5 campuri:

- **Task** — ce sarcina sau context a generat decizia
- **AI Proposal** — ce am propus eu (Claude) initial
- **Operator Decision** — ce a decis operatorul (acceptat / respins / modificat)
- **Reasoning** — de ce a fost aleasa varianta finala
- **Future Adjustment** — ce trebuie sa nu mai repet sau sa aplic in viitor

---

## 2026-05-05 — Hallucinated `data/memory-backups/` in claude-vs-robos.md

- **Task** — Scriere `docs/claude-vs-robos.md` (tabel ASCII pozitionare) pe baza intrebarii operatorului despre ce adauga robOS la Claude.
- **AI Proposal** — Am inclus randul: *"Backup automat la fiecare schimbare in data/memory-backups/."* Folder-ul nu exista in cod, niciun script nu il creeaza.
- **Operator Decision** — Auditul intern din `context/audits/2026-05-05-code-audit.md:224` a flag-uit hallucination-ul in aceeasi zi. Operatorul a cerut explicit reformulare onesta, fara claims neacoperite.
- **Reasoning** — Pattern-matching peste verificare: "un sistem competent are backup, deci robOS are". Niciun mecanism de verificare la gate-ul de generare. CLAUDE.md avea Anti-Hallucination Protocol advisory; eu l-am ignorat.
- **Future Adjustment** — Cand mentionez orice path concret (`data/X/`, `scripts/Y.sh`, `context/Z.md`), verific cu Glob/Read inainte. Salvat ca `feedback_no_hallucinated_features.md` in user memory. Adaugat in suita `mode-shadow` ca regula stricta.

---

## 2026-05-06 — Hallucinated "in git, cu istoric verificabil" pentru munca operatorului

- **Task** — Scriere tabel ASCII LP-ready (Claude singur vs Claude + robOS), randul "scrie cod, editeaza fisiere".
- **AI Proposal** — Am scris: *"In repo-ul tau, in git, cu istoric verificabil. Daca strica ceva, te intorci."* — implicand ca munca operatorului (memorie, brand, clients, projects, output-uri) e versionata in git.
- **Operator Decision** — Operatorul a intrebat direct: "robOS lucreaza cu git nativ sau doar la mine?" Verificare in cod: `.gitignore` include `context/memory/`, `brand/`, `clients/`, `projects/`, `data/`, `.env`. Concluzie: git e doar pentru template, NU pentru munca operatorului. Operatorul a cerut scoaterea claim-ului.
- **Reasoning** — Repet pattern-ul de la 2026-05-05: am citit `docs/claude-vs-robos.md` care continea claim-ul (din primul incident, partial), am extras esenta si am repropus-o in tabel nou. Source contamination — un doc cu eroare se reproduce.
- **Future Adjustment** — Cand spun "in git" sau "cu istoric" pentru orice non-cod, verific `.gitignore` mai intai. Adaugat in `mode-shadow` checklist. `scripts/lint-claims.js` (pre-flight pentru md) urmeaza sa prinda automat path-uri afirmate care nu exista.

---

## 2026-05-06 — Implementare Verification Discipline (Shadow Mode + CONTRACT + lint)

- **Task** — Operatorul a cerut analiza pe reducerea hallucination-ului in robOS si aplicarea Grammar of Intelligence. Apoi: "implementeaza toate fazele, pas cu pas. think hard."
- **AI Proposal** — Plan in 3 faze, 11 pasi: doctrine layer (CONTRACT.md, decision-journal.md, CLAUDE.md updates), skills layer (`mode-shadow`, `mode-facilitator`, `mode-anti-dependence`), mechanism layer (hook trigger detection + `lint-claims.js`).
- **Operator Decision** — Aprobat planul cu cerinta explicita "panifica intai extrem de atent. think hard." Auto mode activ.
- **Reasoning** — Implementare additiva, fara restructurare a fisierelor existente. Hook patch izolat (functie noua, exit 0 silent la eroare). Fara commits pana operatorul cere.
- **Future Adjustment** — Calibration Indicator la final. Update aici cand executia se termina cu rezultatele smoke test.

---

> Format inspirat de OM-AI Protocol. Cand un entry trece in arhive (>6 luni), se muta in `context/decision-journal-archive/{YYYY-MM}.md`.
