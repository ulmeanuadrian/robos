---
name: brand-positioning
version: 2.0.0
category: brand
description: "Gaseste unghiul care vinde. Transformare > produs, mapeaza alternative, cerceteaza mesajele competitor, evalueaza sofisticarea pietii, genereaza 3-5 unghiuri din frameworks (Contrarian, Mechanism, Transformation, Enemy, Specificity)."
triggers:
  - "pozitionare"
  - "diferentiere"
  - "ce e hook-ul"
  - "USP"
  - "cum ma pozitionez"
  - "fa-l sa iasa in evidenta"
  - "unghi unic"
  - "ce angle sa folosesc"
  - "de ce nu se vinde"
  - "marketing-ul nu functioneaza"
  - "positioning"
  - "differentiation"
  - "make this stand out"
  - "find angles for"
  - "what's the hook"
negative_triggers:
  - "voce de brand"
  - "audienta"
  - "brand voice"
  - "buyer persona"
context_loads:
  - brand/positioning.md (reads | writes)
  - brand/voice.md (summary)
  - brand/audience.md (full)
  - context/learnings.md (section brand-positioning)
inputs:
  - product_description (required: ce vinde brand-ul)
  - competitors (optional: nume sau URL-uri competitori cunoscuti)
  - constraints (optional: ce e off-limits pentru pozitionare)
outputs:
  - brand/positioning.md (document complet pozitionare)
tier: core
---

# Pas 0: Update Mode Check

Citeste `brand/positioning.md`.

**Daca exista cu continut real**: intra in **Update Mode**.
- Arata primary angle si statement curent
- Intreaba: "Vrei sa rafinez cu date competitive proaspete, sau pornim de la zero?"
- Refine = ruleaza search competitiv proaspat, sugereaza ajustari
- Start fresh = proces complet de mai jos

**Daca nu exista**: continua cu Pas 1.

# Pas 1: Incarca voice + audience context

Citeste `brand/voice.md` si `brand/audience.md`. Extract:
- Din voce: personalitatea si ton-ul cu care pozitionarea trebuie sa fie compatibila
- Din audienta: pentru cine pozitionam, awareness level, limbajul lor

Daca ambele goale, cere user-ului 2 propozitii: ce vinde si la cine. Continua cu atat.

# Pas 2: Identifica Transformarea (NU produsul)

Nu produsul. **Transformarea.** Cum arata viata clientului dupa? Ce durere dispare? Ce capacitate apare?

Intreaba: "Cum arata viata clientului tau DUPA ce foloseste asta? Ce se schimba?"

Un program de fitness vinde "iti incap iar in blugii vechi". Un SaaS vinde "inchizi laptopul la 5 dupa-amiaza". Transformarea e materia prima pentru unghiuri.

# Pas 3: Mapeaza alternativele

Ce ar face clientii daca asta nu ar exista? NU doar competitorii — TOATE alternativele:
- **Nimic** (traieste cu problema)
- **DIY** (cardezi singur o solutie)
- **Angaja pe cineva** (consultant, freelancer, agentie)
- **Cumpara o categorie complet diferita**
- **Cumpara competitor direct**

Fiecare alternativa are slabiciuni. Aceste slabiciuni devin oportunitati de unghi.

# Pas 4: Adunare product intel

Daca nu sunt deja oferite, intreaba:
1. Ce vinzi? (produs/serviciu, o propozitie)
2. Cine sunt top 3-5 competitori? (nume sau URL-uri)
3. Ce zic clientii ca e motivul #1 sa te aleaga in fata alternativelor?
4. E ceva pe care REFUZI sa competi? (ex: "nu vom fi cei mai ieftini")

# Pas 5: Research mesaje competitor

WebSearch pentru 3-5 competitori (lista oferita + descoperire automatica).

Pentru fiecare competitor, WebFetch:
- Headline + subheadline homepage
- Pagina "About" sau "De ce noi"
- Pagina pret (pozitionare premium vs budget vs value)
- 2-3 blog/social posts recente pentru pattern-uri mesaj

Construieste matricea de mesaj competitor:

| Competitor | Claim primar | Audienta target | Ton | Pozitie pret | Diferentiator cheie |
|-----------|--------------|-----------------|------|----------------|-------------------|

# Pas 6: Evalueaza Market Sophistication

Aplica Schwartz's 5 stages (din *Breakthrough Advertising*):

1. **Stage 1 — Categorie noua**: anunt simplu functioneaza. "Pierde greutate."
2. **Stage 2 — Promisiune amplificata**: mareste claim. "Pierde 10kg in 30 zile."
3. **Stage 3 — Mechanism explicat**: cum functioneaza? "Pierde 10kg cu metoda Atkins."
4. **Stage 4 — Mechanism nou**: claims-urile devin similare. "Atkins 2.0 — fara foame."
5. **Stage 5 — Identity / Experience**: piata e cinica la claim-uri. "Pentru oamenii care urasc cuvantul «dieta»."

**Determina** stadiul actual al pietii pe baza matricii competitor. Stadiul dicteaza tipul de unghi care va functiona.

# Pas 7: Mapeaza peisajul

Din matricea competitor, identifica:
1. **Claim-uri saturate** — Ce zice toata lumea ("cel mai usor", "all-in-one", "trusted by X")
2. **Unghiuri neservite** — Spatii de pozitionare neocupate
3. **Dihotomii false** — Unde competitorii forteaza un either/or pe care produsul tau il rezolva
4. **Conventii categorie** — Presupunerile default despre produse in acest spatiu

Scrie un sumar de 3-5 propozitii: "Piata e pozitionata in jurul X. Cei mai multi competa pe Y. Nimeni nu vorbeste despre Z."

# Pas 8: Genereaza 3-5 unghiuri (din frameworks)

Ruleaza produsul prin multiple framework-uri de unghi:

**1. Contrarian** — Atac convetia categoriei. "Toata lumea zice X, noi zicem Y."
**2. Unique Mechanism** — Cum functionezi diferit. "Singurii care folosesc Z."
**3. Transformation** — Outcome-ul fara mecanism. "Pleaca cu Y."
**4. Enemy** — Identifica inamicul. "Anti-X." (Anti-corporate, anti-burnout, anti-bureaucracy)
**5. Speed/Ease** — Time-to-result. "X in 7 zile." (functioneaza in Stage 2-3 markets)
**6. Specificity** — Hyper-detail. "Pentru founderi SaaS cu 5-20 angajati care fac sub $10k/luna."
**7. Social Proof** — Asociere prestigioasa. "Folosit de Apple, Stripe, Notion."
**8. Risk Reversal** — Elimina downside. "Plateste cand vezi rezultate."

Pentru fiecare unghi:

**Nume**: Label scurt (ex: "The Anti-Enterprise Play", "Category Creator")

**One-Liner**: Brand-ul in o propozitie folosind unghiul

**Psychology**: De ce functioneaza cu aceasta audienta la acest market stage

**Headline direction**: Cum ar suna in copy

**Best for**: Conditii piata si segmente audienta unde merge cel mai bine

**Risk**: Ce poate merge prost — pe cine alieneaza, ce cere sa traga

**Proof Required**: Ce dovada ai nevoie ca sa fie credibil

Format fiecare unghi ca block clar. Numeroteaza-le.

# Pas 9: Validate inainte de save

Pentru fiecare unghi, verifica:
1. **Specific?** ("Rezultate mai bune" pica. "10kg in 6 saptamani" converteste.)
2. **Diferentiat?** Cross-reference peisajul — daca un competitor il claimuieste, ascuti mai mult.
3. **Credibil?** Mechanism sau dovada sustin?
4. **Relevant pentru ACEASTA audienta?** Daca audience.md e incarcat, verifica aliniere.
5. **Duce undeva?** Poti picta headline-ul, landing page-ul, ad-ul?

# Pas 10: Recomanda un unghi

Picteaza cel mai puternic unghi si explica de ce:
- Aliniere cu audienta (din audience.md)
- Putere diferentiere (cat de departe de competitori)
- Credibilitate (poate brand-ul livra pe claim azi?)
- Longevitate (functioneaza si in 12-18 luni?)

Prezinta recomandarea, apoi intreaba: "Asta e alegerea mea. Mergi cu el, sau argumentezi pentru altul? Sau combinam elemente din mai multe?"

# Pas 11: Scrie brand/positioning.md

Dupa confirmare, umple toate sectiunile:

**One-Liner** — Brand-ul in o propozitie. Trebuie sa treaca testul "pot zice asta la bar".

**Value Proposition** — Promisiunea core expandata in 2-3 propozitii. Ce livreaza brand-ul si de ce conteaza.

**Key Differentiators** — 3-5 lucruri specifice care separa brand-ul de competitori. Fiecare trebuie concret si verificabil ("great customer support" e BANNED in afara de cazul cand e sustinut de un mecanism specific).

**Competitor Landscape** — Matricea din Pas 5, curatata. Include unde sta acest brand relativ la fiecare competitor.

**Market Sophistication Stage** — Stadiul curent (1-5) si ce inseamna pentru strategy.

**Category** — Categoria de piata. Daca creezi categorie noua, defineste-o clar si explica din ce categorii adiacente trage.

**Chosen Angle** — Unghiul ales (din Pas 8) cu psychology si headline direction.

**Rejected Angles** — Celelalte 2-4 unghiuri considerate si de ce nu au fost alese.

**Proof Points** — Dovada care sustine pozitionarea. Metrici, testimoniale, case studies, specs tehnice, awards. Daca nu exista, scrie items "TO BUILD" cu sugestii specifice.

# Pas 12: Ad testing matrix offer

Dupa save: "Vrei sa generez o matrice de 12 ad-uri pentru testat acest unghi? 4 hook-uri × 3 formate."

Daca da, genereaza tabelul. Daca nu, continua.

# Pas 13: Log learnings

Append la `context/learnings.md` sub `## brand-positioning`:
- Competitori analizati
- Stadiu market sophistication
- Unghi ales si rationale
- Unghiuri respinse si de ce
- Proof points care trebuie construite
- Data completarii

# Pas 14: Optional feedback loop

La urmatoarea sesiune cu user-ul, intreaba: "Cum a performat unghiul dupa ce l-ai folosit?" Log feedback la learnings.

# Rules

*Actualizat automat cand user-ul flag-eaza issues. Citeste inainte de fiecare run.*

# Self-Update

Daca user-ul flag-eaza issue — unghi gresit, framing prost, semnal competitiv ratat — actualizeaza `# Rules` din acest SKILL.md imediat.

# Troubleshooting

**User nu poate articula transformarea:** Intreaba ce zic cei mai buni clienti — transformarea e in cuvintele lor, nu in ale founder-ului.
**Niciun competitor gasit:** Produsul poate creeaza categorie (Stage 1). Conduce cu unghiuri de anunt simplu.
**Toate unghiurile suna similar:** Mecanismul nu e suficient de clar. Inapoi la Pas 2, sapa mai adanc pe ce face abordarea lor diferita.
**Pozitionare exista dar pare stale:** Ruleaza search competitiv proaspat si compara — piata poate sa fi miscat.
**ICP si positioning conflict:** Flag. ICP-ul poate sugera ca unghiul trebuie ajustat — semnal valoros.
