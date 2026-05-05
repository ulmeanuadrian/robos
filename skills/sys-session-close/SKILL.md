---
name: sys-session-close
version: 1.2.0
category: sys
description: "Inchidere de sesiune cu poarta de confirmare. Verifica deliverables, plan alignment, colecteaza feedback, loghez learnings, finalizeaza memoria zilei si verifica modificari git ne-comise."
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
context_loads:
  - context/memory/YYYY-MM-DD.md (writes)
  - context/learnings.md (appends if feedback given)
inputs: []
outputs:
  - context/memory/YYYY-MM-DD.md actualizat
  - context/learnings.md actualizat (daca s-a dat feedback)
---

# Step 0: Poarta de confirmare (NEW)

Triggers ca "thanks" / "merci" / "pa" sunt usor de declansat accidental. Inainte de a face orice altceva, intreaba EXPLICIT:

"Inchidem sesiunea? Am sa salvez memoria zilei, verific modificari git ne-comise si cer feedback. Spune **da** sa continuam sau **nu** ca sa iesim din skill."

Asteapta raspunsul:
- **Da / yes / inchide / continua** → procedeaza la Step 1
- **Nu / nope / not yet / mai am** → spune "OK, continuam" si IESI din skill imediat. Nu rulezi alte step-uri.
- **Ambiguu** sau user pune o intrebare noua → tratezi noul mesaj ca task normal, nu ca raspuns la confirmare. IESI din skill.

Acest pas elimina 90% din false-fires unde "thanks" era acknowledgment, nu farewell.

# Trigger Guard suplimentar

Inainte de Step 0, sanity check rapid pe trigger:

- **E session-end probabil**: mesaj standalone ("merci!", "gata", "pa"), sau mesajul se termina cu farewell clar
- **NU e session-end**: mesajul continua cu alta cerere ("merci, acum fa X"), sau e mid-conversation acknowledgment

Daca e clar NU session-end, sari peste skill. Daca e ambiguu, foloseste Step 0 — confirmarea explicita rezolva.

# Step 1: Reviu

Scaneaza fisierul de memorie de azi (`context/memory/YYYY-MM-DD.md`) si conversatia curenta. Construieste:

1. **Deliverables** — fisiere create, modificate, publicate. Specific: cai, URL-uri, titluri.
2. **Decisions** — alegeri facute in sesiune. Include rationamentul.
3. **Open threads** — orice inceput dar neterminat, sau amanat explicit.

Daca nu exista fisier de memorie pentru azi, creeaza-l acum din istoricul conversatiei.

# Step 1b: Plan vs Reality Check

Daca fisierul de memorie de azi are sectiunea `### Goal` scrisa de sys-daily-plan (cu prioritati numerotate):

1. Extrage prioritatile planificate (max 3)
2. Compara cu deliverables-urile din Step 1
3. Pentru fiecare prioritate, clasifica:
   - **DONE** — deliverable matches clar prioritatea
   - **PARTIAL** — inceput dar nefinalizat
   - **PIVOTED** — am facut altceva (identifica ce)
   - **SKIPPED** — nu s-a atins
4. Daca o prioritate e PIVOTED sau SKIPPED, noteaza motivul din contextul conversatiei (NU intreba — deduci din ce s-a intamplat)
5. Include in sumarul final:
   ```
   Plan alignment: {DONE count}/3 prioritati completate
   ```
6. Loghez in `context/learnings.md` sub `## General` DOAR daca apare un pattern (3+ zile cu acelasi tip de drift). Pivot-urile single-day sunt normale, nu necesita logare.

# Step 2: Cere Feedback

Intreaba exact: "Cum a mers? Modificari pentru data viitoare?"

Asteapta raspuns. Trei cai posibile:

**Calea A — Pozitiv sau neutru, fara schimbari:**
Noteaza in memorie ca sesiunea a mers bine. Mergi la Step 4.

**Calea B — Feedback specific dat:**
Loghez feedback-ul in `context/learnings.md` la sectiunea skill-ului relevant. Daca feedback-ul e despre comportament general (nu un skill specific), pune-l sub `## General`. Mergi la Step 3.

**Calea C — User sare peste feedback** (zice "nimic", "all good", "nimic special"):
Mergi la Step 4.

# Step 3: Proceseaza Feedback

Daca s-a dat feedback (Calea B):

1. Identifica skill-ul/skills-urile pe care se aplica
2. Deschide `context/learnings.md`
3. Gaseste sau creeaza sectiunea `## {nume-skill}`
4. Adauga intrare cu data:

```markdown
### YYYY-MM-DD
- Feedback: {ce a spus userul, parafrazat}
- Actiune: {ce trebuie schimbat data viitoare}
```

5. Daca feedback-ul implica modificarea skill-ului, noteaza in Open Threads — nu edita skill-ul mid-close.

# Step 4: Finalizeaza Memoria Zilei

Actualizeaza `context/memory/YYYY-MM-DD.md` cu starea finala:

- `### Goal` reflecta ce s-a intamplat efectiv (poate s-a deplasat de la goal-ul initial)
- `### Deliverables` complet si exact
- `### Decisions` capteaza alegeri semnificative
- `### Open Threads` listeaza orice neterminat sau care necesita follow-up
- Daca au fost mai multe sesiuni azi, incrementeaza `## Session N`

La final adauga linia de inchidere care semnaleaza "session-end proper":
```
Session: {N} deliverables, {M} decisions
```
(Asta e pattern-ul pe care session-recovery-check-ul il cauta la urmatorul start.)

# Step 4b: Lint Memory (NEW)

Dupa ce ai actualizat memoria, ruleaza linter-ul:

```bash
node scripts/lint-memory.js
```

- **Exit 0** (clean): mergi mai departe.
- **Exit 1** (errors): linter-ul a gasit sectiuni lipsa sau structura invalida. Repara INAINTE de Step 5. Adauga sectiunile lipsa, normalizeaza header-ele.
- **Warnings** (closing pattern lipsa): poate insemna ca ai uitat linia "Session: N deliverables, M decisions". Verifica si adauga.

Daca scriptul nu exista (versiune mai veche de robOS), sari peste cu un warning intern.

# Step 5: Verifica Modificari Git

Ruleaza `git status` in radacina proiectului. Daca exista modificari ne-comise:

Spune: "Sunt modificari ne-comise: {lista scurta}. Vrei sa fac commit?"

- Daca da: stage + commit cu mesaj descriptiv
- Daca nu: noteaza in Open Threads ca exista modificari ne-comise

Daca git nu e initializat sau nu sunt modificari, sari tacit.

# Step 6: Sumar de Sesiune

Output sumar de 2-3 linii. Format:

```
---
Sesiune: {numar deliverables} deliverables, {numar decisions} decizii. Plan alignment: {X}/3.
{O propozitie despre cel mai important lucru realizat.}
{O propozitie despre open threads, daca exista.}
```

Daca nu existase un plan zilnic (Step 1b nu s-a aplicat), omite "Plan alignment" din output.

Pastreaza-l scurt. Fara "great session!" energy. Doar fapte.
