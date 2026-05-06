# Decision Journal

> Append-only registru cu decizii non-triviale, propuneri AI, alegeri ale operatorului si ce am invatat. Format dupa Meta-Decision Journal din OM-AI Protocol.
>
> Se scrie aici dupa: hallucinations corectate, decizii strategice, audituri cu corectii, schimbari de protocol. NU pentru Q&A trivial sau munca de zi cu zi (jurnalul zilei e in `context/memory/`).

---

## Format

Fiecare entry are 5 campuri:

- **Task** — ce sarcina sau context a generat decizia
- **AI Proposal** — ce a propus Claude initial
- **Operator Decision** — ce a decis operatorul (acceptat / respins / modificat)
- **Reasoning** — de ce a fost aleasa varianta finala
- **Future Adjustment** — ce trebuie sa nu mai repeti sau sa aplici in viitor

Exemplu de entry (format):

```
## YYYY-MM-DD — Titlu scurt al deciziei

- **Task** — ...
- **AI Proposal** — ...
- **Operator Decision** — ...
- **Reasoning** — ...
- **Future Adjustment** — ...
```

---

_(Niciun entry inca. Primul tau hallucination corectat sau decizie strategica netriviala merge aici.)_

---

> Format inspirat de OM-AI Protocol. Cand un entry trece in arhive (>6 luni), se muta in `context/decision-journal-archive/{YYYY-MM}.md`.
