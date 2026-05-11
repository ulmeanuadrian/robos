---
name: tool-fact-checker
version: 1.0.0
category: tool
description: "Verificare sistematica de claim-uri prin analiza bazata pe dovezi. 6 verdicte (TRUE/MOSTLY_TRUE/MIXED/MOSTLY_FALSE/FALSE/UNVERIFIABLE). Standalone sau pipeline mode pentru skill-uri care valideaza claim-uri inainte de publish."
triggers:
  - "verifica faptele"
  - "fact check"
  - "verifica acest claim"
  - "e adevarat"
  - "este corect"
  - "valideaza claim-urile"
  - "verifica afirmatiile"
  - "verify this"
  - "is this true"
  - "check these claims"
  - "fact-check this"
  - "verify claims"
negative_triggers:
  - "voce de brand"
  - "brand voice"
  - "ce parere ai"
  - "what do you think"
  - "opinia ta"
context_loads:
  - context/learnings.md (section tool-fact-checker)
  - skills/tool-fact-checker/references/verification-patterns.md (manipulation patterns)
inputs:
  - claims (required: text cu claim-uri sau array structurat in pipeline mode)
  - mode (optional: standalone | pipeline, auto-detectat)
outputs:
  - projects/tool-fact-checker/{date}/{topic}.md (standalone mode)
  - JSON structurat returnat (pipeline mode)
tier: core
---

# Fact Checker

Verificare sistematica claim-uri prin analiza bazata pe dovezi. Functioneaza standalone sau ca etapa pipeline pe care alte skill-uri o cheama sa valideze claim-uri inainte de publish.

# Skill Relationships

- **Upstream**: Orice skill care produce continut poate trimite claim-uri spre verificare
- **Downstream**: Skill-urile de continut consuma verdictele sa corecteze sau sa flag-eze claim-uri inainte de publish
- **Pipeline integration**: Skill-uri ca `00-youtube-to-ebook` cheama acest skill pe claim-urile extrase inainte sa finalizeze output-ul

# Step 1: Identifica claim-urile

Extract afirmatii factuale specifice din input. Pentru fiecare claim:

1. **Separa fapt de opinie** — opiniile NU sunt fact-checkable
2. Noteaza orice **claim implicit** (presupuneri nestatuate prezentate ca fapt)
3. Identifica aspecte **masurabile / verificabile**
4. Flag **statistici, date, nume, claim-uri cauzale** ca high-priority

In **pipeline mode**, claim-urile vin pre-extrase. Sari la Step 2.

# Step 2: Determina dovada necesara

Pentru fiecare claim, stabileste:
- Ce ar dovedi claim-ul ca TRUE?
- Ce l-ar respinge?
- Care surse ar fi authoritative pentru acest domeniu?
- E verificabil deloc, sau intrinsec subiectiv?

# Step 3: Aduna si evalueaza dovada

Foloseste WebSearch si WebFetch sa gasesti surse authoritative. Prioritizeaza pe credibilitate:

1. **Studii peer-reviewed** — cea mai mare credibilitate
2. **Statistici oficiale** (guvernamentale, institutionale) — date authoritative
3. **Jurnalism reputabil** (publicatii fact-checked) — reporting verificat
4. **Statements de la experti** — opinie calificata in domeniul lor
5. **Site-uri de stiri generale** — cross-reference cu alte surse
6. **Social media / blogs** — credibilitate cea mai joasa, verifica independent

Pentru fiecare sursa: noteaza data publicare, credentials autor, posibila bias, primary vs secondary.

# Step 4: Rate fiecare claim

Aplica unul din verdictele:

| Verdict | Inseamna |
|--------|---------|
| **TRUE** | Acurat si sustinut de dovada credibila |
| **MOSTLY TRUE** | Acurat dar lipsa context important sau detalii minore gresite |
| **MIXED** | Contine atat elemente adevarate cat si false |
| **MOSTLY FALSE** | Inselator sau larg inacurat |
| **FALSE** | Demonstrabil gresit |
| **UNVERIFIABLE** | Nu poate fi confirmat sau negat cu dovada disponibila |

Citeste `references/verification-patterns.md` pentru pattern-uri comune de manipulare de urmarit (statistical cherry-picking, context removal, false equivalences, logical fallacies).

# Step 5: Produce report

**Standalone mode** — salveaza report complet la `projects/tool-fact-checker/{date}/{topic}.md`:

```markdown
# Fact Check: {Topic}

## Sumar
{X} claim-uri verificate | {Y} verified | {Z} flagged

## Claim-uri

### Claim 1: "{statement exact}"
**Verdict: {RATING}**

**Analiza:** {De ce acest rating}

**Dovada:**
- {Dovada cheie + sursa}

**Context:** {Nuanta importanta, de ce conteaza}

**Informatia corecta:** {Daca false/misleading, versiunea acurata}

---
{Repeta pentru fiecare claim}

## Surse
{Lista numerotata cu note de credibilitate}
```

**Pipeline mode** — returneaza date structurate la skill-ul caller:

```json
{
  "claims": [
    {
      "text": "claim exact",
      "verdict": "TRUE|MOSTLY_TRUE|MIXED|MOSTLY_FALSE|FALSE|UNVERIFIABLE",
      "confidence": "high|medium|low",
      "evidence_summary": "sumar pe o linie",
      "corrected_text": "null sau versiune corectata",
      "sources": ["sursa 1", "sursa 2"]
    }
  ],
  "overall_reliability": "high|medium|low",
  "flagged_count": 0
}
```

Mereu salveaza output la disk. Asta NU e optional. Dupa save, arata user-ului path-ul absolut complet.

# Step 6: Colecteaza feedback

Dupa livrare report, intreaba: "Cum a aterizat? Vreun claim pe care l-am gresit sau ratat?"

Log feedback in `context/learnings.md` sub `## tool-fact-checker` cu data + context.

# Rules

- Claim-urile trebuie evaluate **individual**, NU ca grup
- NICIODATA rate opinie ca TRUE sau FALSE — marc ca not fact-checkable
- Mereu ofera versiunea corectata cand un claim e FALSE sau MOSTLY FALSE
- In pipeline mode, returneaza date structurate, NU proza
- **Recenta surselor conteaza** — prefera surse din ultimii 2 ani pentru claim-uri current-affairs

# Self-Update

Daca user-ul flag-eaza issue cu output-ul — verdict gresit, claim ratat, evaluare sursa proasta — actualizeaza sectiunea `# Rules` imediat cu corectia.
