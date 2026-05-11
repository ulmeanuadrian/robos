---
name: tool-humanizer
version: 2.0.0
category: tool
description: "Sterge pattern-uri AI din text si restaureaza vocea umana naturala. 50+ AI tells detectate, scoring 0-10 human-ness, 3 moduri (quick / standard / deep cu voice-profile match). Foloseste pattern-library + replacement-guide din references/."
triggers:
  - "umanizeaza"
  - "fa-l natural"
  - "sterge pattern AI"
  - "suna prea AI"
  - "curata textul"
  - "de-AI"
  - "humanize this"
  - "make this sound human"
  - "remove AI patterns"
  - "AI detection"
  - "clean up this copy"
negative_triggers:
  - "voce de brand"
  - "pozitionare"
  - "tradu"
  - "brand voice"
  - "positioning"
  - "translate"
context_loads:
  - brand/voice.md (reads, doar in deep mode)
  - brand/samples.md (reads, doar in deep mode, pentru tone refs)
  - context/learnings.md (section tool-humanizer)
  - skills/tool-humanizer/references/pattern-library.md (full pattern detection)
  - skills/tool-humanizer/references/replacement-guide.md (replacement strategy)
inputs:
  - text (required: text de umanizat — paste sau file path)
  - mode (optional: quick | standard | deep, default: standard)
outputs:
  - Text curatat (return inline sau salvat in fisier original)
  - Pattern report (standard si deep mode)
tier: core
---

# Humanizer

Sterge pattern-uri AI din text. Fa-l sa sune ca scris de un om.

# Step 1: Detect Mode

Alege din context sau intreaba: *"Quick pass, full cleanup, sau voice-matched?"*

| Mode | Ce face | Cel mai bun pentru |
|------|---------|-------|
| `quick` | Sterge cliche-uri AI obvio + buzzwords. Single pass, NO scoring. | Edit-uri sociale rapide, docs interne |
| `standard` | Pattern scan complet (50+ detecții) + human-ness score + change log | Orice continut public |
| `deep` | Full scan + replace cu pattern-urile din voice-profile.md. Loads `brand/voice.md` | Blog posts, landing pages, email — orice care trebuie sa sune ca brand-ul |

**Default: `standard`.** Cand e called de alt skill ca post-processing, foloseste `deep` daca `brand/voice.md` exista, `standard` altfel.

# Step 2: Load Context

Daca mode = `deep`, citeste `brand/voice.md` (rezolvat via active-client). Daca file lipseste, downgrade silent la `standard` si spune o data: "voice.md not found — running standard mode. Ruleaza /brand-voice ca sa activezi deep mode."

Extract din voice.md:
- Vocabular preferat (foloseste ca replacements)
- Cuvinte evitate (flag ca AI tells chiar daca nu sunt in pattern library)
- Linguistic habits (connectors, intensifiers, rhythm)
- Samples pentru tone reference

# Step 3: Score Original

Rate text-ul input pe scara 0-10 human-ness:

| Score | Inseamna |
|-------|---------|
| 0-3 | Obvio AI — multiple cliche-uri, structura robotica, hedging peste tot |
| 4-5 | AI-heavy — unele atingeri umane dar nevoie de munca majora |
| 6-7 | Mixt — poate merge oricum, lipsa voce distinctiva |
| 8-9 | Human-like — voce naturala, pattern-uri AI minime |
| 10 | Indistinguibil de scriitor uman skilled |

**Factori scoring:**
- Pattern AI count per 500 cuvinte (fewer = better)
- Variance lungime propozitii (higher variance = mai uman)
- Specificity ratio (termeni concreti vs vagi qualifiers)
- Variatie structurala (NU fiecare paragraf aceeasi forma)

# Step 4: Pattern Detection + Removal

Citeste `references/pattern-library.md` pentru lista completa de 50+ pattern-uri. Categorii:

1. **AI cliches & openers** — "In today's fast-paced world", "Let's dive in", "It's no secret"
2. **Hedging language** — "It's important to note", "arguably", "one might argue", "it's worth noting that"
3. **Corporate buzzwords** — "leverage", "utilize", "facilitate", "optimize", "synergy", "holistic", "ecosystem"
4. **Robotic structure** — rhetorical Q+A, obsessive parallelism, always-three lists, "Here are the top X"
5. **Overused transitions** — "Moreover", "Furthermore", "Additionally", "Nevertheless", "Consequently"
6. **Promotional inflation** — "transformative", "game-changer", "unprecedented", "revolutionary"
7. **Wikipedia AI tells** — inflated symbolism, em dash overuse, rule of three, vague attributions, negative parallelisms, conjunctive phrase abuse
8. **Vocabulary tells** — "delve", "tapestry", "multifaceted", "landscape", "nuanced", "foster", "realm", "journey", "fabric", "beacon", "mosaic", "symphony"
9. **Negative parallelism** — "not X but Y", "less about X, more about Y", "it's not just X, it's Y"
10. **Vague attributions** — "experts say", "studies show", "many believe", "according to sources"

Pentru fiecare pattern detectat:
1. Count occurrences
2. Flag fiecare instance cu line reference
3. Aplica fix din `references/replacement-guide.md`

# Step 5: Enhance Human Markers

Dupa stergerea pattern-urilor, adauga semnale de voce naturala:
- **Varied sentence rhythm** — sparge propozitii de aceeasi lungime
- **Contractions** — "it's" not "it is" (in afara de context formal)
- **Active voice** — flip passive constructions
- **Confident assertions** — sterge hedging in afara de cazul cand realmente incert
- **Specific examples** — flag vague references pentru user sa concretizeze

In `deep` mode, aplica pattern-urile din voice-profile:
- Insereaza connectors si tranzitii preferate de brand
- Match lungime propozitii din samples
- Foloseste vocabular brand ca replacements pentru termeni generici

# Step 6: Score Revised + Output

Scor text-ul revizat. Arata schimbarile:

```
ORIGINAL: 4.2/10
REVISED:  8.4/10

Schimbari:
  [N] AI cliches sterse
  [N] buzzwords inlocuite
  [N] hedging phrases taiate
  [N] pattern-uri structurale fix-uite
  [N] voice markers adaugate

Flag-uri pentru review:
  [paragraf/linie] — [ce necesita atentie manuala]
```

# Step 7: Output Mode

- **Standalone** (user pasted text): prezinta text-ul curatat direct
- **File mode** (path provided): ofera sa overwrite sau save ca fisier nou
- **Pipeline mode** (called de alt skill): returneaza text silently. Arata score summary doar daca delta > 2 puncte. Calling skill-ul e responsabil pentru save.

# Step 8: Log Learnings

Append in `context/learnings.md` sub `## tool-humanizer`:
- Mode folosit
- Top pattern-uri detectate
- Before/after score
- Feedback user (daca exista — "too aggressive", "keep em dashes", etc.)
- Data completarii

# Pipeline Mode

Cand e called de alt skill (NU standalone), acest skill:
1. Primeste text ca input
2. Ruleaza Steps 2-6 silently
3. Returneaza text curatat
4. Arata score summary DOAR daca change-ul a fost semnificativ (delta > 2 puncte)

Calling skill-ul e responsabil pentru save.

# Scoring Thresholds

| Score | Label | Actiune |
|-------|-------|--------|
| 90-100 | Clean | NU sunt schimbari necesare |
| 70-89 | Light | Fix doar pattern-urile flag-ate |
| 50-69 | Moderate | Rewrite propozitiile flag-ate |
| 0-49 | Heavy | Full rewrite recomandat |

# Rules

*Actualizat automat cand user-ul flag-eaza issues. Citeste inainte de fiecare run.*

# Self-Update

Daca user-ul flag-eaza issue — too aggressive, missed a pattern, false positive — actualizeaza instruction-ul relevant in acest fisier DIRECT unde behavior-ul e definit (NU doar la learnings).

# Troubleshooting

**Text-ul devine prea formal:** Mode "quick" e prea light, "deep" prea greu. Foloseste "standard" si flag manual ce e overdone.
**Lipsa voice-profile in deep mode:** Downgrade silent la standard + mentioneaza o data.
**Em dashes legitimately stilistice:** User adauga in learnings "keep em dashes" — pattern detection se ajusteaza la urmatorul run.
**Output mai prost decat input:** Score post < pre means pattern fix-urile au stricat structura. Rolled back, reraise issue la learnings.
