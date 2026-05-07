---
name: sys-session-close
version: 2.0.0
category: sys
description: "Inchidere de sesiune cu poarta de confirmare. Mecanica (memorie, lint, git, plan-vs-reality) e incapsulata intr-un sub-agent — userul vede doar confirmation gate, intrebarea de feedback si sumarul final."
triggers:
  - "gata"
  - "am terminat"
  - "inchidem"
  - "inchid sesiunea"
  - "ma opresc aici"
  - "pa"
  - "merci, gata"
  - "thanks"
  - "that's it"
  - "done for today"
  - "bye"
  - "wrap up"
  - "close session"
  - "session done"
  - "signing off"
  - "I'm done"
negative_triggers:
  - "thanks, now"
  - "thanks, also"
  - "thanks, can you"
  - "thanks for that, next"
  - "merci, acum"
  - "merci, mai am"
  - "gata cu asta, urmatorul"
output_discipline: encapsulated
context_loads:
  - context/memory/YYYY-MM-DD.md (writes — via sub-agent)
  - context/learnings.md (appends — via sub-agent)
inputs: []
outputs:
  - context/memory/YYYY-MM-DD.md actualizat
  - context/learnings.md actualizat (daca s-a dat feedback)
---

# Output Discipline (citeste inainte de a face orice)

Acest skill ruleaza in mod **incapsulat**. In transcriptul vizibil userului trebuie sa apara DOAR trei lucruri:

1. Promptul de confirmare de la Step 0 (si raspunsul userului)
2. Intrebarea de feedback "Cum a mers?" (si raspunsul userului)
3. Sumarul final de 2-3 linii

**Reguli stricte:**
- NU folosi TodoWrite in acest skill. Niciodata.
- NU anunta "Step 1", "Step 2", "Acum verific X" catre user.
- NU rula Bash direct din main thread pentru memorie / lint / git — deleaga.
- NU rula Read/Write/Grep direct din main thread pe memorie sau learnings — deleaga.
- Singura exceptie: dupa ce userul aproba explicit un commit (Step 3), bash-ul de commit e vizibil pentru ca e o actiune autorizata.

Daca te prinzi gandind "stai sa verific intai X" — OPRESTE-TE. Trece nevoia aceea in promptul sub-agentului.

---

# Step 0: Poarta de confirmare (main thread)

Triggers ca "thanks" / "merci" / "pa" sunt usor de declansat accidental. Inainte de orice altceva, intreaba EXPLICIT:

"Inchidem sesiunea? Am sa salvez memoria zilei, verific modificari git ne-comise si cer feedback. Spune **da** sa continuam sau **nu** ca sa iesim din skill."

Asteapta raspunsul:
- **Da / yes / inchide / continua** → procedeaza la Step 1
- **Nu / nope / not yet / mai am** → spune "OK, continuam" si IESI din skill imediat. Nu rulezi alte step-uri.
- **Ambiguu** sau user pune o intrebare noua → tratezi noul mesaj ca task normal, nu ca raspuns la confirmare. IESI din skill.

# Trigger Guard suplimentar

Inainte de Step 0, sanity check rapid pe trigger:

- **E session-end probabil**: mesaj standalone ("merci!", "gata", "pa"), sau mesajul se termina cu farewell clar
- **NU e session-end**: mesajul continua cu alta cerere ("merci, acum fa X"), sau e mid-conversation acknowledgment

Daca e clar NU session-end, sari peste skill. Daca e ambiguu, foloseste Step 0 — confirmarea explicita rezolva.

---

# Step 1: Deleaga mecanica catre sub-agent (UN SINGUR Agent call)

Dupa confirmare, construieste mental un **rezumat de o singura paragrafa** al sesiunii (asta e singurul lucru pe care sub-agentul nu il poate deduce din fisiere):

- La ce a lucrat userul (subiect general)
- Fisiere create / modificate (cai concrete)
- Decizii cheie (cu motiv scurt)
- Lucruri incepute dar neterminate

Apoi invoca Agent tool **o singura data**:

```
subagent_type: general-purpose
description: "Inchidere sesiune — mecanica interna"
prompt: """
Esti agentul de mecanica interna pentru sys-session-close in robOS.

REZUMAT CONVERSATIE (de la main thread):
{paragraful tau}

Ruleaza tacit urmatoarele:

1. Citeste context/memory/{YYYY-MM-DD de azi}.md. Daca nu exista, creeaza-l acum din rezumat.

2. Daca fisierul are sectiunea ### Goal cu prioritati numerotate (scrise de sys-daily-plan), calculeaza Plan vs Reality:
   - Pentru fiecare prioritate clasifica: DONE / PARTIAL / PIVOTED / SKIPPED
   - alignment = "{done_count}/3"
   Daca nu exista plan, alignment = null.

3. Actualizeaza fisierul de memorie:
   - ### Goal reflecta ce s-a intamplat efectiv
   - ### Deliverables complet (cai exacte, URL-uri, titluri)
   - ### Decisions cu rationamentul
   - ### Open Threads cu ce a ramas neterminat
   - Daca au fost mai multe sesiuni azi, incrementeaza ## Session N
   - Adauga la final linia: "Session: {N} deliverables, {M} decisions"

4. Pattern-uri de drift: daca alignment a fost <2/3 in ultimele 3+ zile consecutiv, adauga in context/learnings.md sub ## General o singura linie cu pattern-ul. Pivot-urile single-day NU se logheaza.

5. Ruleaza: node scripts/lint-memory.js
   - Exit 0: OK
   - Exit 1: repara structura si reruleaza
   - Script missing: skip silentios
   - Warnings despre closing pattern: verifica linia "Session: ..." si re-adauga daca lipseste

6. Ruleaza: git status --short
   Captureaza fisierele modificate (NU comite — userul decide la Step 3).
   **DACA git nu e instalat sau folder-ul nu e repo** (eroare "not a git repo" sau "command not found"):
   seteaza `git_changes: []` si continua silentios. NU afisa eroare userului.
   robOS e proiectat sa functioneze fara git — git e optional pentru istoric versionat.

7. Returneaza DOAR acest JSON, nimic altceva:
{
  "deliverables_count": N,
  "decisions_count": M,
  "plan_alignment": "X/3" sau null,
  "headline": "o singura propozitie despre cel mai important lucru realizat",
  "open_threads_count": N,
  "open_threads_list": ["thread 1 scurt", "thread 2 scurt"],
  "git_changes": ["path1", "path2"] sau [],
  "lint_passed": true/false
}
"""
```

Astepti rezultatul JSON al sub-agentului. Nu il afisezi userului.

---

# Step 2: Cere feedback (main thread)

Intreaba EXACT: "Cum a mers? Modificari pentru data viitoare?"

Asteapta raspunsul:

**Calea A — Pozitiv/neutru, fara schimbari** ("nimic", "all good", "merge bine"):
Sari direct la Step 3.

**Calea B — Feedback specific** (mentioneaza un comportament, un skill, o preferinta noua):
Invoca al DOILEA Agent call:

```
subagent_type: general-purpose
description: "Log feedback in learnings"
prompt: """
Adauga acest feedback in context/learnings.md.

Feedback verbatim de la user: "{raspunsul lor}"

Identifica skill-ul caruia i se aplica (uitati-va la conversatie). Daca e despre comportament general, foloseste sectiunea ## General. Altfel ## {nume-skill}.

Adauga sub sectiunea potrivita:

### {YYYY-MM-DD}
- Feedback: {parafrazat in 1-2 linii}
- Actiune: {ce trebuie schimbat data viitoare}

Daca feedback-ul implica modificarea unui skill, NU edita skill-ul — adauga la finalul memoriei zilei o linie in Open Threads: "Modifica skill {nume}: {ce}".

Returneaza: "logged"
"""
```

**Calea C — User sare peste** ("nimic special"):
Sari la Step 3.

---

# Step 3: Git commit prompt (main thread, conditional, OPTIONAL)

**Git e optional pentru robOS.** Studentii cu instalare din tarball n-au initial git in folder
si nici nu trebuie. Acest pas se ruleaza DOAR daca userul a `git init`-uit deja.

Daca JSON-ul de la sub-agent are `git_changes` non-gol:

Spune: "Sunt modificari ne-comise: {lista scurta din git_changes}. Vrei sa fac commit?"

- **Da**: ruleaza `git add` + `git commit` cu mesaj descriptiv. Comanda asta E vizibila — userul a autorizat-o.
- **Nu**: nimic. Sub-agentul a logat deja in Open Threads.

Daca `git_changes` e gol (NU e repo git, sau git nu e instalat), sari **tacit** acest pas — nu mentiona git deloc.

---

# Step 4: Sumar final (main thread)

Output **exact** acest format, nimic mai mult:

```
---
Sesiune: {deliverables_count} deliverables, {decisions_count} decizii. Plan alignment: {plan_alignment}.
{headline}
Open threads: {open_threads_list joined cu ", "}.
```

Omiteri:
- Daca `plan_alignment` e null, scoate ", Plan alignment: ..." din prima linie.
- Daca `open_threads_count` e 0, scoate ultima linie.

Fara "Great session!", fara emoji, fara "succes maine!". Doar fapte. STOP.
