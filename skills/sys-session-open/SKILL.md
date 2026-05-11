---
name: sys-session-open
version: 2.0.0
category: sys
description: "Deschidere de sesiune simetrica cu sys-session-close. Identity load, recovery check si skill reconciliation ruleaza incapsulat — userul vede cel mult o linie de salutare cu open threads, sau nimic daca primul mesaj e un task."
triggers:
  - "deschide sesiunea"
  - "incepe sesiunea"
  - "session open"
  - "open session"
  - "startup check"
  - "sesiune noua"
negative_triggers:
  - "deschide fisierul"
  - "open file"
output_discipline: encapsulated
context_loads:
  - context/SOUL.md (sub-agent reads)
  - context/USER.md (sub-agent reads)
  - context/memory/ (sub-agent reads, latest file)
  - skills/_index.json (sub-agent reads)
inputs: []
outputs:
  - State intern (memorat pentru prima interactiune)
  - data/session-state/{session_id}.json actualizat
tier: core
---

# Output Discipline (citeste inainte de a face orice)

Acest skill ruleaza in mod **incapsulat**. In transcriptul vizibil userului trebuie sa apara DOAR:

- Nimic, daca hook-ul `UserPromptSubmit` deja a injectat STARTUP CONTEXT (cazul normal).
- O singura linie de salutare cu open threads SAU welcome-back, daca e prima interactiune si exista context relevant.
- Mesajul de onboarding pentru user nou (Step 5), daca aplicabil.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: Identity load", "Step 2: Recovery check", etc.
- NU rula Read direct din main thread pentru SOUL.md, USER.md, memorie sau skill index — deleaga.
- NU regurgita continutul SOUL/USER catre user. Internalize. Niciodata replay.

In modul normal (cu hook activ), tot ce trebuie sa faci aici e ZERO output catre user. Hook-ul a livrat deja contextul ca system reminder; sub-agentul confirma starea si tu pastrezi tacerea.

---

# Context

Acest skill e contraponderea lui `sys-session-close`. Sesiunea trebuie sa aiba un open simetric:
inchidem cu confirmation gate + memorie finalizata + git check, deci deschidem cu identity load + recovery check + open threads surface — toate tacit, toate incapsulate.

In mod normal, hook-ul `UserPromptSubmit` (din `.claude/settings.json`) injecteaza deja un STARTUP CONTEXT bundle la primul prompt al sesiunii. Skill-ul asta formalizeaza ce trebuie sa faci dupa.

Daca esti aici fara hook (sesiune mai veche, hook dezactivat, debugging), ruleaza pasii prin sub-agent.

---

# Step 1: Deleaga identity load + recovery check (UN SINGUR Agent call)

Invoca Agent tool o singura data:

```
subagent_type: general-purpose
description: "Deschidere sesiune — identity + recovery"
prompt: """
Esti agentul de mecanica interna pentru sys-session-open in robOS.

Ruleaza tacit:

1. Citeste context/SOUL.md si context/USER.md. Extrage doar campurile critice:
   - SOUL: tone, hard rules, never-do
   - USER: name, business, key preferences
   Daca vreunul lipseste / e gol / contine doar template comments → flag "user_not_onboarded": true.

2. Verifica brand/voice.md. Daca e doar template (HTML comments, no real content) → "user_not_onboarded": true.

3. Recovery check pe context/memory/:
   - Cazul A: fisier pentru data de azi exista
     → returneaza open_threads din el (parseaza ### Open Threads)
     → "case": "A", "session_continuation": true
   - Cazul B: nu exista pentru azi, dar exista istoric
     → gaseste cel mai recent fisier (sortat dupa filename YYYY-MM-DD)
     → verifica linia "Session: N deliverables, M decisions"
       - Are linia: "case": "B-clean"
       - NU are linia: "case": "B-abandoned" (extrage open threads)
     → calculeaza zile_de_la_ultima_sesiune; daca >3 → "long_absence": true, captureaza last_goal
   - Cazul C: niciun fisier de memorie → "case": "C", probabil user nou

4. Skill reconciliation (tacit):
   - Citeste skills/_index.json (instalate)
   - Citeste skills/_catalog/catalog.json (disponibile)
   - "new_in_catalog": skills din catalog dar nu instalate (max 3, doar nume)
   - "outdated": skills instalate cu versiune sub catalog (max 3)
   Aceste flag-uri NU se afiseaza la user; folosite la session-close pentru Open Threads.

5. Mark session open: daca data/session-state/{session_id}.json nu exista pentru sesiunea curenta, creeaza-l cu {started_at, first_prompt_at}. In mod normal hook-ul face asta — verifica si creeaza doar daca lipseste.

6. Returneaza DOAR acest JSON:
{
  "user_not_onboarded": true/false,
  "case": "A" | "B-clean" | "B-abandoned" | "C",
  "session_continuation": true/false,
  "open_threads": ["..."] sau [],
  "long_absence": true/false,
  "days_since_last": N sau null,
  "last_session_date": "YYYY-MM-DD" sau null,
  "last_goal": "..." sau null,
  "today_has_plan": true/false,
  "new_in_catalog": ["..."],
  "outdated": ["..."]
}
"""
```

Pastreaza JSON-ul intern. Nu il afisezi.

---

# Step 2: Decide ce afisezi (main thread)

Pe baza JSON-ului si a primului mesaj al userului:

**Daca `user_not_onboarded`** → vezi Step 3 de mai jos.

**Daca primul mesaj e un task concret** → ZERO output. Mergi direct la lucru. Foloseste skill-ul daca routerul l-a marcat in STARTUP CONTEXT.

**Daca primul mesaj e o salutare scurta** ("hey", "salut", "buna", "morning"):
- Raspunde scurt (max 3 linii).
- Daca `session_continuation` SI exista `open_threads`: o linie cu "Ultima sesiune ({last_session_date}) a ramas cu: {threads scurt}. Continuam?"
- Daca `case == "B-abandoned"`: "Sesiunea anterioara ({last_session_date}) nu a fost inchisa curat. Open threads: {...}. Reluam?"
- Daca `long_absence`: "Welcome back. Ultima sesiune ({last_session_date}): {last_goal}."
- Daca `today_has_plan == false` SI dimineata: o linie "Spune **plan de zi** ca sa-ti planific ziua."

**Daca primul mesaj e ambiguu** → o singura intrebare de clarificare.

Niciodata: greeting ceremonial, "buna dimineata!", "sigur ca te ajut!", listare mecanica de open threads daca userul nu a salutat.

---

# Step 3: New User Path (only if user_not_onboarded)

Spune EXACT: "Bine ai venit in robOS. Spune **onboard me** ca sa te configurez in 15 minute, sau sari direct la orice task."

NU rula automat sys-onboard. Asteapta confirmarea.

---

# Reguli generale

- **Niciodata nu output STARTUP CONTEXT bundle catre user.** E intern.
- **Niciodata nu repeta continutul SOUL/USER.** Internalize, nu replay.
- **Niciodata nu blocheaza primul mesaj cu protocol.** Userul scrie un task → mergi la lucru.

# Eliminari false-positive

Hook-ul stie ca acest skill nu se ruleaza explicit prin trigger — ruleaza la primul prompt al fiecarei sesiuni. Triggerele in frontmatter sunt pentru:
- Re-rulare manuala (debugging)
- Cazuri unde hook-ul nu a rulat

Daca userul scrie efectiv "deschide sesiunea", confirma scurt: "Sesiune deja deschisa pe {data}. Vrei sa rulez recovery check din nou?"
