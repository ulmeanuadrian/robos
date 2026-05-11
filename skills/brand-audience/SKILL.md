---
name: brand-audience
version: 2.0.0
category: brand
description: "Construieste ICP prin interview founder, research competitive, sau combinatie. Output: profil audienta structurat cu demografie, psihografie, pain points, limbaj real, trigger-uri de cumparare."
triggers:
  - "audienta"
  - "client ideal"
  - "ICP"
  - "cui ii vand"
  - "buyer persona"
  - "avatar client"
  - "profilul clientului"
  - "target audience"
  - "audience research"
  - "ideal customer"
  - "who am I selling to"
  - "customer avatar"
negative_triggers:
  - "voce de brand"
  - "pozitionare"
  - "brand voice"
  - "positioning"
  - "competitor landscape"
context_loads:
  - brand/audience.md (reads | writes)
  - brand/positioning.md (summary)
  - brand/voice.md (summary)
  - context/learnings.md (section brand-audience)
inputs:
  - mode (optional: interview | research | both — auto-detectat daca nu specificat)
  - source_urls (optional: URL-uri competitori, reviews, social pentru research mode)
  - product_description (optional: ce vinde brand-ul)
outputs:
  - brand/audience.md (document ICP structurat in 8 sectiuni)
tier: core
---

# Pas 0: Update Mode Check

Citeste `brand/audience.md`.

**Daca exista cu continut real**: intra in **Update Mode**.
- Arata sumar de 1 paragraf despre profilul curent
- Intreaba ce vrea sa schimbe (target segment nou, limbaj refresh, obiectii actualizate)
- Update targeted, NU rebuild de la zero

**Daca nu exista sau e doar template**: continua cu Pas 1.

# Pas 1: Incarca context existent

Citeste `brand/positioning.md` si `brand/voice.md` daca au continut real. Extract context:
- Din pozitionare: ce categorie, ce value prop, pentru cine
- Din voce: ce sugereaza ton-ul despre audienta (formal = enterprise, casual = consumer)

Daca ambele goale, continua — dar noteaza ca audienta facuta in izolatie poate trebui revizuita dupa ce pozitionarea e definita.

# Pas 2: Determina Mode

- **Interview**: Default cand user-ul e founder-ul si poate raspunde la intrebari despre clientii lui
- **Research**: Cand user-ul ofera URL-uri competitori, sites de review, sau zice "scoate-l din piata"
- **Both**: Interview intai pentru ipoteza, apoi research pentru validare cu limbaj real al clientilor

Daca neclar, intreaba: "Vrei sa te intervievez despre cei mai buni clienti, sau sa cercetez piata din surse publice? Sau ambele?"

Daca user-ul ofera URL sau mentioneaza platforma specifica in primul mesaj → direct la **Research mode**.

# Pas 3: Executa Mode

## Interview Mode

Intreaba in 2 batch-uri. Sumarizeaza dupa fiecare batch inainte sa continui. Concentreaza-te sa scoti **limbajul propriu al clientului** — nu marketing-speak. Cuvintele lor cand isi descriu problema sunt mai valoroase decat cum o framuieste founder-ul.

**Batch 1 — Cine sunt:**
1. Descrie cel mai bun client — cel pe care l-ai clona daca ai putea. Ce face? Cati ani are? Unde traieste?
2. Ce facea / folosea inainte sa te gaseasca?
3. Care a fost momentul cand a realizat ca ii trebuie ce vinzi?
4. Ce cuvinte EXACTE a folosit cand ti-a descris pentru prima oara problema?

**Batch 2 — Cum cumpara:**
5. Unde sta online? Care platforme, comunitati, newsletter-uri?
6. Ce format de continut consuma de fapt — long reads, video scurt, podcast, tweet-uri?
7. Ce obiectii apar inainte de cumparare? Ce aproape il opreste?
8. Cat de constient e de solutii ca a ta? (Nu stie ca exista / Stie categoria / Compara optiuni / Gata sa cumpere)
9. Ce ii face in final sa apese trigger-ul?
10. Dupa cumparare, ce e primul lucru pe care il observa sau il comenteaza?

Maximum 8 intrebari. Daca pozitionarea e incarcata, skip intrebarile la care raspunde deja.

Dupa ambele batch-uri, sinteza si prezentare: "Iata profilul pe care il construiesc. Ce e gresit sau lipseste?"

## Research Mode

**Surse de minat (in ordine prioritate):**
1. Reviews ale produsului sau competitorilor (Amazon, G2, Capterra, app stores)
2. Reddit/forum threads unde audienta target discuta problema
3. Comentarii social media pe continut competitor
4. Comentarii YouTube pe video-uri relevante
5. Survey data sau testimoniale (daca user-ul le ofera)

**Proces:**
1. WebSearch pentru 3-5 competitor sites, platforme reviews, comunitati
2. WebFetch pe fiecare sursa
3. Extract semnale audienta:
   - Din competitor sites: cui se adreseaza (limbaj, imagini, tier pret)
   - Din reviews: ce lauda clientii, ce reclama, ce isi doresc
   - Din comunitati: cum isi descriu oamenii problema in propriile lor cuvinte
4. Cross-reference semnalele sa gasesti pattern-urile consistente
5. Prezinta findings cu nivel confidence: "High confidence: SMB owners. Medium: 30-45 age range."

Scopul e sa extragi pattern-uri in: cum descriu problema, ce au incercat, ce i-a frustrat, ce outcome vor — in **cuvintele lor exacte**.

## Both Mode (Interview + Research)

Ruleaza Interview intai sa construiesti ipoteza, apoi Research sa validezi si enrichuiesti cu limbaj real. Flag orice gap intre presupunerile founder-ului si semnalele reale ale clientilor — asta e signal valoros.

# Pas 4: Validate

Inainte sa scrii audience.md, valideaza profilul.

Scrie 2 propozitii ca si cum ai vorbi direct cu acest client despre pain-ul lui primar — una care AR TREBUI sa rezoneze, una care NU.

Intreaba: *"Clientul tau ideal ar citi prima propozitie si ar zice 'asta intelege ce traiesc'?"*

- **Da** → continua la Pas 5
- **Aproape dar nu chiar** → intreaba ce nu merge, ajusteaza, retest
- **Nu** → sapa mai adanc pe limbaj si pain

Cap la 3 round-uri.

# Pas 5: Scrie brand/audience.md

Umple toate 8 sectiuni cu continut specific, utilizabil:

**1. Demographics** — Varsta, locatie, rol/titlu job, marime companie (daca B2B), bracket venit (daca B2C). Fii specific: "founderi SaaS cu 5-20 angajati" NU "business owners".

**2. Psychographics** — Valori, credinte despre industrie, cum se vad pe ei insisi. Cum se identifica? Ce comunitate sunt parte?

**3. Pain Points** — Top 3-5 probleme ranked pe intensitate. Foloseste limbajul lor real, nu marketing polish. Format: pain + de ce solutiile existente nu merg pentru ei.

**4. Aspirations** — Unde vor sa fie in 6-12 luni. Cum arata succesul in termeni concreti? Cu ce s-ar lauda peer-ilor?

**5. Content Consumption Habits** — Platforme specifice, ora din zi, preferinte format. "Scrolleaza LinkedIn la 7 dimineata, asculta podcast in trafic, citeste newsletter la pranz" nivel de detaliu.

**6. Language & Words They Use** — Fraze reale, jargon level, terms of art. Include 5-10 fraze verbatim pe care le-ar folosi sa descrie problema. Noteaza orice cuvinte care i-ar face sa abandoneze.

**7. Awareness Level** — Unde sta majoritatea audientei pe spectrul (Unaware / Problem-Aware / Solution-Aware / Product-Aware / Most Aware). Noteaza distributia.

**8. Buying Triggers** — Evenimentele, momentele, conditiile specifice care ii muta de la "interesat" la "cumpara". Trigger-uri pe timp, pe prag de durere, sociale.

# Pas 6: Log learnings

Append la `context/learnings.md` sub `## brand-audience`:
- Mode folosit si surse analizate
- Nivel confidence in profil (high/medium/low per sectiune)
- Intrebari deschise care necesita validare (vorbeste cu clienti reali, run survey, etc.)
- Data completarii

# Pas 7: Optional offer pozitionare

Daca `brand/positioning.md` NU exista:
> "Acum ca avem ICP-ul, vrei sa definim si unghiul de pozitionare? Asta cristalizeaza cum vorbim cu aceasta audienta in piata. (da / skip)"

Daca da → invoca `brand-positioning`.

Daca exista, skip silent.

# Rules

*Actualizat automat cand user-ul flag-eaza issues. Citeste inainte de fiecare run.*

# Self-Update

Daca user-ul flag-eaza issue cu output-ul — audienta gresita, limbaj prost, segment lipsa, presupunere incorecta — actualizeaza sectiunea `# Rules` din acest SKILL.md imediat cu corectia si data de azi.

# Troubleshooting

**Founder descrie clientul prea larg:** Forteaza specificitate. "Antreprenori" = prea larg. "Solo founders care fac $5-15k/luna si isi fac singuri marketing-ul" = util.
**Nu gasesti limbaj real online:** Cere founder-ului sa share email-uri reale, DMs, support tickets.
**Apar segmente multiple:** Construieste primary ICP pentru segmentul cel mai valoros. Noteaza secondary segments la fond pentru referinta viitoare.
**Pozitionare neincarcata:** Continua, dar noteaza ca unghiul de pozitionare ar ajuta la prioritizat segmentul.
**ICP si positioning conflict:** Flag. ICP-ul poate dezvalui ca unghiul de pozitionare trebuie ajustat — asta e signal valoros.
