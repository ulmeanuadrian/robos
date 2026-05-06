---
name: tool-whatsapp
version: 1.0.0
category: tool
description: "Trimite mesaje WhatsApp prin WhatsApp Cloud API (Meta) sau prin link wa.me direct. Suporta text, template messages si media (imagini, documente)."
triggers:
  - "trimite WhatsApp"
  - "send WhatsApp"
  - "WhatsApp catre"
  - "WhatsApp message"
  - "trimite-i un mesaj pe WhatsApp"
  - "ping pe WhatsApp"
negative_triggers:
  - "WhatsApp button"
  - "scrie despre WhatsApp"
  - "explain WhatsApp"
context_loads:
  - brand/voice.md (reads, pentru ton)
  - brand/audience.md (reads, daca destinatarul e in audienta)
  - context/learnings.md (section tool-whatsapp)
inputs:
  - to (required: numar de telefon in format E.164, ex: +40712345678)
  - message (required: textul mesajului)
  - mode (optional: cloud-api | wa-link, default: detectat din .env)
  - media_url (optional: URL public catre imagine/video/document)
outputs:
  - Confirmare trimitere (cloud-api) sau link wa.me (wa-link)
  - Log in projects/tool-whatsapp/{date}.log
---

# Pre-conditii

Acest skill suporta doua moduri:

**Mod 1: WhatsApp Cloud API (Meta)** — recomandat pentru volum.
Necesita in `.env`:
- `WHATSAPP_ACCESS_TOKEN` — token Meta cu permisiuni `whatsapp_business_messaging`
- `WHATSAPP_PHONE_NUMBER_ID` — ID-ul numarului de telefon din Meta Business

Get-uri la: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started

**Mod 2: Link wa.me** — fallback fara API. Genereaza un URL `https://wa.me/{numar}?text={mesaj}` pe care userul il deschide manual. Util pentru CTA-uri publice.

Daca niciun mod nu e configurat, returneaza link wa.me + nota despre cum se configureaza Cloud API.

# Step 1: Detecteaza modul

Verifica `.env`:
- Daca `WHATSAPP_ACCESS_TOKEN` si `WHATSAPP_PHONE_NUMBER_ID` exista si nu sunt goale → mod **cloud-api**
- Altfel → mod **wa-link**

User poate forta modul cu input-ul `mode`.

# Step 2: Valideaza input-urile

- `to` trebuie sa fie format E.164 (+40..., +1..., etc). Daca lipseste prefix-ul, intreaba: "Numarul ce tara are? Adaug prefix-ul."
- `message` trebuie sa fie sub 4096 caractere (limita WhatsApp). Daca depaseste, intreaba: "Mesajul are X caractere. Tai sau split in 2 mesaje?"

# Step 3a: Mod cloud-api

Trimite POST catre `https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`:

```json
{
  "messaging_product": "whatsapp",
  "to": "{numar fara +}",
  "type": "text",
  "text": { "body": "{mesaj}" }
}
```

Header: `Authorization: Bearer {ACCESS_TOKEN}`

Daca raspunsul are `messages[0].id` → confirmat. Loghez `wamid` si `to`.

Daca eroare:
- 401: token expirat sau invalid → instructiuni regenerare
- 131030: numar nu e in lista de testare (cont sandbox) → instructiuni adaugare
- 132012: format numar invalid → re-valideaza E.164

# Step 3b: Mod wa-link

Construieste URL:
```
https://wa.me/{numar fara +}?text={mesaj URL-encoded}
```

Returneaza link-ul cu instructiuni: "Deschide acest link in browser sau pe mobil."

# Step 4: Ton si voce

Daca `brand/voice.md` exista si mesajul e generat (nu copiat verbatim de user):
- Aplica regulile din voice.md
- Pentru audienta romana: tu, fara dumneavoastra
- Fara emoji-uri pe surface marketing/sales (per voice.md)
- WhatsApp e canal informal — sentinte scurte, fara formule corporate

# Step 5: Loghez

Append in `projects/tool-whatsapp/{YYYY-MM-DD}.log`:
```
{timestamp} | {mode} | {to} | {success/error} | {wamid sau eroare}
```

NU loghez continutul mesajului (privacy).

Append in `context/learnings.md` la `## tool-whatsapp`:
- Ce mod a fost folosit
- Daca au existat probleme de delivery
- Pattern-uri de mesaje care functioneaza

# Notes

- Pentru template messages (mesaje aprobate de Meta cu placeholder), foloseste `type: template` in payload — diferit de text. Nu suportat in versiunea curenta.
- Pentru bulk send (>50 destinatari), foloseste rate limiting: 1 mesaj/secunda pentru cont basic Cloud API.
- Daca operatorul foloseste WhatsApp ca CTA principal (per brand/positioning.md), citeste numarul propriu din `WHATSAPP_PHONE_NUMBER_ID` in `.env` — nu hardcoda numere de telefon in skill.
