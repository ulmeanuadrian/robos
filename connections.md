# Conexiuni

<!-- Actualizat de skill-ul sys-onboard si manual pe masura ce adaugi integrari -->
<!-- Fiecare tool se mapeaza pe unul din 7 domenii tier-1: venituri, clienti, calendar, comunicare, task-uri, intalniri, cunostinte -->

Ultima actualizare: (inca nu)

## Conectate
(Niciuna inca -- ruleaza "onboard me" ca sa inventariezi tool-urile, apoi conecteaza-le pe rand)

## Planificate

| Tool | Domeniu | Tip conexiune | Status |
|------|---------|---------------|--------|
| (ex: Stripe) | venituri | API | neconectat |
| (ex: Google Calendar) | calendar | MCP | neconectat |

## Cum conectezi un tool

1. Spune: "Ajuta-ma sa conectez {numele tool-ului}"
2. Claude va cerceta documentatia API si va crea un fisier referinta
3. Ia-ti cheia API din setarile tool-ului
4. Adaug-o in `.env` (nu pune chei in chat)
5. Testeaza cu o interogare simpla read-only

## Acoperire pe domenii

| Domeniu | Tool | Status |
|---------|------|--------|
| Venituri | - | neconectat |
| Clienti | - | neconectat |
| Calendar | - | neconectat |
| Comunicare | - | neconectat |
| Task-uri | - | neconectat |
| Intalniri | - | neconectat |
| Cunostinte | (fisiere locale) | integrat |
