---
name: tool-pdf-generator
version: 1.0.0
category: tool
description: "Genereaza PDF-uri curate, minimaliste din markdown. Tipografie pentru reading, layout cu margini generoase. pandoc + weasyprint (preferat) sau Python weasyprint standalone. Suport theme branded prin brand/design-tokens.md."
triggers:
  - "genereaza PDF"
  - "converteste in PDF"
  - "fa un PDF"
  - "export ca PDF"
  - "markdown la PDF"
  - "generate PDF"
  - "convert to PDF"
  - "make a PDF"
  - "export as PDF"
  - "markdown to PDF"
negative_triggers:
  - "citeste PDF"
  - "extrage din PDF"
  - "read PDF"
  - "extract from PDF"
context_loads:
  - context/learnings.md (section tool-pdf-generator)
  - brand/design-tokens.md (doar in branded theme mode)
inputs:
  - input (required: path la fisier .md sau text markdown raw)
  - output_path (optional: unde sa salveze; default projects/tool-pdf-generator/{date}/{name}.pdf)
  - theme (optional: minimal | branded — default minimal)
  - intensity (optional: subtle | heavy — doar pentru branded)
  - logo (optional: URL sau path la logo — doar branded)
  - links (optional: "Label1=url1,Label2=url2" — doar branded)
outputs:
  - PDF la output_path
  - Copie la ~/Downloads/{name}.pdf (default)
runtime_dependencies:
  - python: ">=3.11"
  - "pandoc OR weasyprint (auto-detected)"
tier: content-creator
---

# PDF Generator

Convert markdown in PDF profesional cu styling minim. Optimizat pentru reading long-form — tipografie buna, margini generoase, line lengths readable.

# Step 1: Check prerequisites

Verifica backend-uri PDF disponibile in ordinea preferintei:

1. **pandoc + weasyprint**: `command -v pandoc` + `python3 -c "import weasyprint"`
2. **Python weasyprint standalone**: `python3 -c "import weasyprint"` + `python3 -c "import markdown"`
3. **pandoc + pdflatex**: `command -v pandoc` + `command -v pdflatex`

Daca niciunul disponibil, ruleaza `bash skills/tool-pdf-generator/scripts/setup.sh` pentru install dependencies.

# Step 2: Pregateste continutul

Accepta markdown ca:
- Path la fisier `.md` existent
- String markdown raw (pipeline mode)

Daca markdown-ul nu are titlu (`# heading`), extrage unul din primul paragraf sau filename.

# Step 3: Genereaza PDF

**Minimal theme (default):**
```bash
python3 skills/tool-pdf-generator/lib/md_to_pdf.py "{input_md}" "{output_pdf}"
```

**Branded theme** (foloseste design tokens din brand/):
```bash
python3 skills/tool-pdf-generator/lib/md_to_pdf.py "{input_md}" "{output_pdf}" \
  --theme branded --tokens brand/design-tokens.md \
  --intensity {subtle|heavy}
```

Adauga flag-urile cand sunt enabled:
- `--logo {logo_url_or_path}` — daca user a oferit logo
- `--links "Label1=url1,Label2=url2"` — daca user a oferit links

Script-ul handleaza:
- Markdown → HTML conversion
- CSS styling (minimal clean sau din design tokens daca branded)
- PDF rendering via weasyprint

**Fallback daca scriptul Python esueaza:**
```bash
pandoc "{input_md}" -o "{output_pdf}" --pdf-engine=weasyprint
```

Sau, ultimul resort:
```bash
pandoc "{input_md}" -o "{output_pdf}" -V geometry:margin=1in -V fontsize=11pt
```

# Step 4: Livreaza

- Salveaza PDF la output_path (default: `projects/tool-pdf-generator/{date}/{name}.pdf`)
- Copy la `~/Downloads/{name}.pdf` (rezolvat via `getDownloadsPath()` portable, Windows/macOS/Linux)
- Arata path-ul absolut complet

Mereu salveaza output la disk. Asta NU e optional.

# Step 5: Colecteaza feedback

Intreaba: "Cum arata PDF-ul? Vreo ajustare la formatare sau layout?"

Log feedback in `context/learnings.md` sub `## tool-pdf-generator` cu data si context.

# Rules

- **Default style**: clean, minimal, optimizat pentru reading (NU prezentare)
- **Body font**: serif, 11-12pt equivalent
- **Line height**: 1.5-1.6 pentru readability
- **Margins**: generoase (cel putin 2.5cm / 1 inch)
- **Max line width**: ~70 caractere pentru reading confortabil
- **No headers/footers** in afara de cazul cand cerut explicit
- **No cover page** in afara de cazul cand cerut explicit

# Self-Update

Daca user-ul flag-eaza issue cu output-ul — formatare proasta, fonts gresite, layout rupt — actualizeaza sectiunea `# Rules` cu corectia.

# Troubleshooting

**weasyprint install fail pe Windows:** Cere Visual C++ Build Tools sau MSVC. Foloseste pandoc + pdflatex fallback.
**pandoc not found:** Install via winget pe Windows (`winget install JohnMacFarlane.Pandoc`) sau brew pe macOS.
**Font lipsa:** Foloseste fallback la font de sistem (serif default).
**Layout rupt cu markdown complex:** Simplifica tabele/code blocks; weasyprint nu suporta toate constructiile pandoc.
