---
name: brand-voice
version: 2.0.0
category: brand
description: "Extrage sau construieste profilul de voce brand prin 4 moduri: import ghid existent, extrage din continut, build via interview (quick sau playbook deep), auto-scrape din URL cu Firecrawl + brand assets."
triggers:
  - "voce de brand"
  - "stil de scris"
  - "ton brand"
  - "analizeaza continutul meu"
  - "ghid voce"
  - "defineste vocea"
  - "ruleaza playbook voce"
  - "playbook voce de brand"
  - "brand voice"
  - "tone of voice"
  - "writing style"
  - "voice playbook"
  - "deep voice rebuild"
negative_triggers:
  - "pozitionare"
  - "audienta"
  - "keyword"
  - "competitor analysis"
  - "positioning"
context_loads:
  - brand/voice.md (reads | writes)
  - brand/samples.md (writes)
  - brand/assets.md (writes — doar Auto-Scrape cu Firecrawl)
  - brand/positioning.md (summary)
  - brand/audience.md (summary)
  - context/learnings.md (section brand-voice)
inputs:
  - mode (optional: import | extract | build | auto-scrape — auto-detectat daca nu e specificat)
  - source_urls (optional: URLs pentru extract/auto-scrape)
  - guidelines_doc (optional: path sau text paste pentru import)
  - depth (optional: quick | playbook — doar pentru Build mode, default quick)
outputs:
  - brand/voice.md (profil voce in 6 dimensiuni)
  - brand/samples.md (5-10 sample-uri reprezentative)
  - brand/assets.md (logo, culori, fonts — doar Auto-Scrape cu Firecrawl disponibil)
secrets_optional:
  - FIRECRAWL_API_KEY
tier: core
---

# Pas 0: Verifica daca exista profil

Citeste `brand/voice.md` (rezolvat via active-client mechanism cand client e activ).

**Daca exista cu continut real** (nu doar template): intra in **Update Mode**.
- Arata user-ului sumar de 1 paragraf despre vocea curenta
- Intreaba ce vrea sa schimbe
- NU rescrii de la zero. Inainte de a suprascrie o sectiune, arata diff-ul si cere confirmare.

**Daca nu exista sau e doar template**: continua cu Pas 1 (Mode Selection).

# Pas 1: Incarca context existent

Citeste `brand/positioning.md` si `brand/audience.md` daca au continut real. Rezuma fiecare in 2-3 bullet-uri pentru referinta interna. Daca sunt goale, mentioneaza ca vocea va fi construita fara constrangerile pozitionare/audienta — flag in output ca recomandare de completat ulterior.

# Pas 2: Determina Mode

Detecteaza modul din input-ul user-ului:

- **Import**: "am un ghid de brand", paste/link la doc voce
- **Extract**: ofera URLs sau docs cu continut publicat existent
- **Build**: "de la zero", "ajuta-ma sa-mi gasesc vocea", sau nu exista sursa
- **Auto-Scrape**: ofera URL si zice "analizeaza site-ul", "scrape this"

Daca ambiguu, intreaba O singura intrebare: "Ai continut existent pe care sa-l analizez, sau construim de la zero?"

Daca user-ul a oferit URL in primul mesaj → direct la **Auto-Scrape**. Daca a atasat/pastat un brand guide structurat → direct la **Import**.

# Pas 3: Executa Mode

## Import Mode

Pentru brand-uri care au deja guidelines/brand book/style guide.

**Accepta:** Text paste, PDF, sau orice document cu guidelines brand.

**Proces:**
1. Citeste guidelines complet
2. Mapeaza structura lor pe formatul nostru de 6 dimensiuni (vezi Pas 4)
3. Identifica gap-uri — frecvent lipsesc: sample-uri reale, anti-pattern-uri (cum NU suna brand-ul), reguli per-platforma, vocabular
4. Prezinta sumar: "Iata ce acopera guidelines-ul tau si ce lipseste"
5. **Enrichment offer:** "Vrei sa adaug surse aditionale (LinkedIn, site, alte continuturi) pentru sample-uri reale si umplere gap-uri?"
   - Daca da → ruleaza Auto-Scrape sau Extract pe sursele aditionale, merge cu profilul importat
   - Daca nu → continua cu ce exista, mentionand gap-urile in profil

**Merge rules** cand enriching:
- Guidelines importate sunt autoritatea — enrichment umple gap-uri, NU suprascrie
- Daca enrichment contrazice guidelines, flag: "Guidelines-ul zice X dar LinkedIn-ul tau suna mai mult ca Y — care e real?"
- Sample-urile din continut real merg mereu in `samples.md`, chiar daca guidelines-ul ofera copy exemplu

## Extract Mode

Pentru continut raw — website copy, email-uri, social posts, newsletter-uri, transcript-uri.

**Sample gate:** Minimum 3 sample-uri SAU 500+ cuvinte totale. Sub 500 cuvinte → ofera Quick mode (top 5 trasaturi + 3 reguli) sau cere mai mult continut.

**Sample priority — de la cel mai autentic la cel mai redactat:**
1. Slack messages sau email-uri casual (raw, needitat)
2. Podcast sau call transcripts
3. Social posts (LinkedIn, Twitter)
4. Website copy (cel mai editat, cel mai putin autentic)

**Ruleaza extragerea:**
1. Citeste/fetch 5-10 piese de continut
2. Pentru fiecare, noteaza: lungime medie propozitii, marker-i ton, pattern-uri vocabular, alegeri de formatare
3. Gaseste pattern-urile consistente (vocea "reala" vs variatii one-off)
4. Sinteza in cele 6 dimensiuni (Pas 4)

Dupa analiza, colecteaza 5-10 propozitii care reprezinta cel mai bine vocea pentru `samples.md`.

## Build Mode

Pentru pornire de la zero, sau cand continutul existent e prea generic.

**Quick vs Playbook fork — intreaba intai:**

Foloseste `AskUserQuestion`:
- intrebare: "Cat de adanc mergem?"
- optiuni:
  - `quick` — 5-8 intrebari tintite, ~5 min
  - `playbook` — Full Agentic Academy interview, ~10-15 min (cel mai bun cand pornesti de la zero absolut)
- default: `quick`

**Daca user-ul a indicat deja preferinta** (ex: "ruleaza playbook-ul de voce"), skip intrebarea si du-te direct pe varianta corecta.

**Daca user-ul a produs deja un corpus puternic de sample-uri** prin Import/Extract/Auto-Scrape in sesiunea curenta, NU oferi Playbook — au deja materialul; tine Build pe Quick.

### Quick variant — 8 intrebari in 3 batch-uri

**Batch 1 — Identitate:**
1. Daca brand-ul tau ar fi o persoana la o cina, cum ar vorbi?
2. Numeste 3 brand-uri al caror ton il admiri. Ce iti place la fiecare?
3. Ce cuvinte/fraze NU ar trebui sa apara NICIODATA in continutul tau?

**Batch 2 — Stil:**
4. Scurt si direct, sau detaliat si amanuntit? Alege unul, apoi spune-mi unde e exceptia.
5. Folosesti umor? Daca da, ce fel — sec, autoironic, jucaus?
6. Cat de tehnic poti merge inainte sa pierzi audienta?
7. Emoji, semne de exclamare, ALL CAPS — care e politica?

**Batch 3 — Autoritate:**
8. Pe ce subiecte poti vorbi cu incredere absoluta? Pe ce subiecte cedezi altora?

Dupa fiecare batch, sumarizeaza ce ai auzit inapoi la user pentru confirmare inainte de a continua.

### Playbook variant — Agentic Academy Playbook (deep)

Walk through structurat:

**Step 1 — Personality (5 intrebari):**
1. Daca brand-ul tau ar fi o persoana, cum ar fi descris in 3 cuvinte? (NU cuvinte corporate — cuvinte umane)
2. Care sunt 3 lucruri pe care brand-ul tau le-ar refuza sa zica/faca, chiar daca ar genera engagement? (anti-patterns)
3. Numeste un brand a carui voce o admiri. Ce SPECIFIC iti place? (Vag = "sunt cool"; bun = "folosesc fraze scurte fara jargon")
4. Cand cineva citeste continutul tau pentru prima oara, ce ar trebui sa simta in primele 10 secunde?
5. Ce e cel mai natural lucru pe care l-ai zis user-ului tau ultima data? Reda-l verbatim. (Acesta e "real you")

**Step 2 — Strategic Framework (4 intrebari — skip Q1/Q2 daca exista icp.md/positioning.md):**
1. Cine e clientul tau ideal? (skip daca audience.md complet)
2. Care e unghiul tau distinctiv pe piata? (skip daca positioning.md complet)
3. Daca clientul tau ar trebui sa-ti recomande in 1 propozitie unui prieten, ce ar zice?
4. Care e cea mai mare frica/dorinta a clientului tau pe care continutul tau o adreseaza?

**Step 3 — Example Collection:**
Cere user-ului sa ofere 5-10 sample-uri din comunicarea lor reala (email, mesaj, post). Aceste sample-uri merg direct in `samples.md`.

**Synthesis Instructions Playbook:**
Deriva fiecare caracteristic din raspunsurile REALE ale user-ului. NICIODATA template din exemple. Core Voice Characteristics trebuie numite din cuvintele lui actuale; signature phrases trebuie sa fie frazele lui actuale; never-list trebuie sa reflecte raspunsul Q2 anti-corporate.

## Auto-Scrape Mode

Pentru cand user-ul ofera URL si vrea research facut.

### Strategie de scraping

Incearca surse in aceasta ordine, folosind tool-ul cel mai ieftin care merge:

1. **WebFetch intai** (gratis) — incearca homepage, About, 2-3 blog posts, LinkedIn
2. **Daca WebFetch esueaza** (JS-heavy, bot protection, continut gol) → fallback la Firecrawl
   - Verifica `.env` pentru `FIRECRAWL_API_KEY`
   - Daca lipseste → trigger Fallback flow (mai jos). NU te opri aici.
   - Daca exista, foloseste Firecrawl scrape endpoint cu `formats=["markdown"]`

### Extragere brand assets

Cand un URL e oferit si Firecrawl e disponibil, ruleaza si **Firecrawl branding extraction**:

```
formats=["branding"]  →  culori, fonts, logo-uri, spacing, brand traits
```

Raporteaza inapoi user-ului:
> **Gasit pe site-ul tau:**
> - Logo: [URL sau "nu gasit"]
> - Culori primare: [valori hex sau "nu gasit"]
> - Fonts: [nume fonts sau "nu gasit"]
> - Brand traits: [daca detectate]
>
> **N-am putut detecta automat:**
> - [Lista — social handles, brand photography, etc.]
>
> Le poti adauga manual in `brand/assets.md`.

Salveaza assets gasite in `brand/assets.md`. Daca Firecrawl nu e disponibil, skip extragerea de assets si noteaza: "N-am putut detecta automat assets vizuale. Le poti adauga manual in `brand/assets.md` mai tarziu."

### Voice extraction process

1. Fetch continut din: homepage, About, 2-3 blog posts, LinkedIn bio + posts recente, Twitter/X
2. Raporteaza ce ai gasit (pagini, word count, calitate semnal)
3. Hraneste tot continutul in Extract mode (vezi mai sus)
4. Follow up cu 2-3 intrebari gap-filling: intent evolutie, fraze urate, voice inspiration

### Fallback — NU bloca crearea de assets brand

Daca scraping esueaza din orice motiv (key lipsa, site blocheaza, JS-heavy), **mereu** ofera sa construiesti assets brand oricum. NICIODATA nu te opri pentru ca un URL n-a putut fi scraped.

**Cand URL-ul nu poate fi scraped**, intreaba user-ul:
> "N-am putut scrape URL-ul — [motiv]. Doua optiuni:
> 1. **Adauga API key-ul acum** — paste `FIRECRAWL_API_KEY` si retry imediat
> 2. **Construieste assets brand acum** — iti voi pune cateva intrebari, putem scrape URL-ul mai tarziu sa enrichuim"

Daca user-ul alege optiunea 2 (sau n-are key), comuta la **Build Mode** si completeaza profilul de voce, sample-uri, si alte assets. URL-ul ramane notat in profil pentru scrape viitor.

**Regula critica:** User-ul trebuie mereu sa iasa din flow cu assets brand complete — `voice.md`, `samples.md` — indiferent daca scraping a mers. Scraping enrichuieste output-ul; nu il blocheaza.

# Pas 4: Scrie brand/voice.md

Umple toate 6 sectiuni cu indrumare specifica, actionabila. Fiecare sectiune trebuie sa includa:
- O directiva clara (nu doar un label)
- 1-2 exemple concrete care arata vocea in actiune
- Un exemplu "NU asa" care arata ce sa eviti

NU lasa nicio sectiune ca placeholder. Daca informatia e insuficienta, scrie cea mai buna versiune posibila si adauga comentariu `<!-- NEEDS REVIEW: ... -->`.

## Cele 6 dimensiuni

1. **Tone** — formal/casual, serios/jucaus, autoritar/peer-level
2. **Vocabulary** — cuvinte semnatura, ce cuvinte se folosesc/se evita, jargon level
3. **Sentence Rhythm** — lungime medie, structura (simple/compound), uz rare de propozitii lungi pentru emphasis
4. **Personality Traits** — 3-5 trasaturi human-words (NU corporate-speak)
5. **Formatting Preferences** — emoji, exclamatii, ALL CAPS, bullet vs paragraf, linkuri
6. **Confidence Zones** — pe ce subiecte vorbeste cu autoritate, pe ce cedeaza altora

Daca s-a folosit Playbook mode, asigura-te ca fiecare sectiune e tracabila la un raspuns specific — nu limbaj template.

# Pas 5: Voice Test (TOATE modurile)

Dupa ce ai produs orice profil de voce, valideaza inainte sa salvezi. NU sari peste.

Scrie 3 sample-uri folosind profilul extras/construit:
- Un opening de email 3-4 propozitii
- Un social post (match platforma cea mai folosita)
- Un headline landing page + 2 propozitii suport

Intreaba: *"Suna ca tine cand NU te razgandesti?"*

- **Da** → salveaza
- **Aproape dar nu chiar** → intreaba ce nu merge, ajusteaza sectiuni specifice, retest
- **Nu** → cere un exemplu care E corect, re-extrage din el

Cap la 3 round-uri. Daca tot nereolvat, ofera sa salvezi versiunea curenta si rafinezi in timp.

# Pas 6: Scrie brand/samples.md

5-10 sample-uri. Pentru fiecare noteaza: tip sursa, si de ce e reprezentativ.

```markdown
## [Sursa] — [ex: email catre lista / LinkedIn post / homepage]
"[Propozitie exact cum a fost scrisa]"
*De ce e reprezentativa: [1 propozitie]*
```

Dupa salvare, arata user-ului excerpts reale — nu doar confirmare ca s-a salvat.

# Pas 7: Log learnings

Append la `context/learnings.md` sub o sectiune `## brand-voice`:
- Mode folosit
- Decizii cheie (ex: "ales informal in loc de formal pentru ca...")
- Gap-uri flag-ate pentru review viitor
- Data completarii

# Pas 8: Optional context enrichment

Dupa salvare, ofera sa adauci context cu audienta si pozitionare. **Optional** — user-ul poate sari peste si continua.

**ICP offer** — daca `brand/audience.md` nu exista:
> "Vrei sa definim si profilul clientului ideal? Un ICP precis ajuta pipeline-ul sa scrie copy care rezoneaza — 5-8 intrebari, ~5 min. (da / skip)"

Daca da → invoca skill-ul `brand-audience`.

**Positioning offer** — daca `brand/positioning.md` nu exista:
> "Vrei sa definim un unghi de pozitionare? Asta spune pipeline-ului ce te face diferit. (da / skip)"

Daca da → invoca skill-ul `brand-positioning`.

Daca ambele exista deja, skip silent.

# Rules

*Actualizat automat cand user-ul flag-eaza issues. Citeste inainte de fiecare run.*

# Self-Update

Daca user-ul flag-eaza issue cu output-ul — ton gresit, format prost, context lipsa, presupunere incorecta — actualizeaza sectiunea `# Rules` din acest SKILL.md imediat cu corectia si data de azi. NU doar log la learnings; **fix skill-ul ca sa nu repete greseala**.

# Troubleshooting

**Sample-uri insuficiente:** Cere mai mult continut, sau comuta la Build mode.
**Vocea suna generic dupa extract:** Website copy e adesea sanitizat. Cere email-uri sau mesaje Slack.
**User-ul nu se hotaraste pe ton:** Scrie 2 versiuni contrastante ale aceleiasi propozitii, intreaba care e mai aproape.
**Pozitionare neincarcata:** Continua, dar noteaza ca ar fi ascutit pozitionarea vocii.
**Profil exista dar user vrea de la zero:** Confirma inainte de a suprascrie. Ofera sa salvezi versiunea veche cu sufix de data.
**Firecrawl key lipsa:** Foloseste WebFetch + ofera build mode ca fallback. NICIODATA nu opri flow-ul.
