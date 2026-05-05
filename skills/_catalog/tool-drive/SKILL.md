---
name: tool-drive
version: 1.0.0
category: tool
description: "Cauta, citeste si descarca fisiere din Google Drive folosind un service account. Suporta Docs, Sheets, PDF-uri si fisiere binare."
triggers:
  - "cauta in Drive"
  - "citeste din Drive"
  - "descarca din Drive"
  - "search Drive"
  - "Google Drive"
  - "ia fisierul de pe Drive"
  - "list Drive folder"
negative_triggers:
  - "upload to Drive"
  - "share on Drive"
  - "Google Docs editor"
context_loads:
  - context/USER.md (reads)
  - context/learnings.md (section tool-drive)
inputs:
  - action (required: search | read | download | list)
  - query (required pentru search/list: query string Drive sau folder ID)
  - file_id (required pentru read/download: ID-ul fisierului)
  - format (optional pentru read: text | markdown | json, default: detectat din mime type)
outputs:
  - Continut fisier (read)
  - Lista metadata fisiere (search/list)
  - Fisier descarcat in projects/tool-drive/ (download)
---

# Pre-conditii

Necesita in `.env`:
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` — path catre fisier JSON cu credentialele service account-ului
  (sau `GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64` — JSON-ul codat base64, util cand nu vrei fisier extern)

Configurare service account:
1. Du-te la https://console.cloud.google.com → APIs & Services → Credentials
2. Creeaza service account, da-i rol "Viewer"
3. Genereaza cheie JSON, salveaza local
4. Activeaza Google Drive API la https://console.cloud.google.com/apis/library/drive.googleapis.com
5. Share fiecare folder/fisier la care vrei acces cu email-ul service account-ului (format: `xxx@xxx.iam.gserviceaccount.com`)

Daca credentialele lipsesc, skill-ul intoarce instructiuni de setup, nu eroare.

# Step 1: Valideaza credentialele

Citeste `.env`. Daca lipseste atat `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` cat si `_BASE64`, intoarce:

"Pentru a accesa Drive am nevoie de un service account. Ghid in 5 pasi:
{lista de mai sus}
Spune-mi cand ai cheia JSON gata."

Stop.

# Step 2: Determina actiunea

Detecteaza din input:
- **search**: user a spus "cauta in Drive" + un text → query Drive cu fulltext
- **list**: user a spus "ce e in folderul X" + un folder ID/nume → list children
- **read**: user a spus "citeste fisierul X" + un ID sau nume → fetch content
- **download**: user a spus "descarca X" → save in projects/tool-drive/

Daca ambiguu, intreaba: "Vrei sa caut, sa citesc sau sa descarc?"

# Step 3a: Search

Endpoint: `GET https://www.googleapis.com/drive/v3/files`

Query params:
- `q`: `fullText contains '{user_query}' and trashed = false`
- `fields`: `files(id,name,mimeType,modifiedTime,size,webViewLink)`
- `pageSize`: 20

Returneaza lista cu format:
```
1. {nume} (Doc/Sheet/PDF, modificat: {data})
   ID: {id}
   Link: {webViewLink}
```

# Step 3b: List folder

Endpoint: `GET https://www.googleapis.com/drive/v3/files`

Query params:
- `q`: `'{folder_id}' in parents and trashed = false`
- `fields`: `files(id,name,mimeType,modifiedTime)`
- `orderBy`: `modifiedTime desc`

# Step 3c: Read

Decide endpoint pe baza mime type-ului:

- **Google Docs** (`application/vnd.google-apps.document`):
  `GET /drive/v3/files/{id}/export?mimeType=text/markdown`
- **Google Sheets** (`application/vnd.google-apps.spreadsheet`):
  `GET /drive/v3/files/{id}/export?mimeType=text/csv`
- **PDF / text / json** (binar standard):
  `GET /drive/v3/files/{id}?alt=media`

Returneaza continutul. Daca > 100KB, salveaza in `projects/tool-drive/{slug}.{ext}` si intoarce calea + preview primele 50 linii.

# Step 3d: Download

`GET /drive/v3/files/{id}?alt=media`

Salveaza la `projects/tool-drive/{nume_fisier}`. Pastreaza extensia originala. Loghez path-ul.

# Step 4: Caching

Pentru fisiere mai mari de 1MB sau accesate de >2 ori, cache local in `data/drive-cache/{file_id}.{ext}` cu TTL 1 ora pe baza `modifiedTime`. La a doua rulare, daca `modifiedTime` din API matches cache-ul, foloseste cache-ul.

# Step 5: Loghez

Append in `context/learnings.md` la `## tool-drive`:
- Action folosita
- Numar de rezultate / dimensiune fisier
- Erori (cu codul HTTP)
- Pattern-uri (ex: "userul cere des fisiere din folder-ul X — candidat pentru indexare locala")

# Authentication helper (referinta pentru implementare)

Service account JWT flow:
1. Citeste fisierul JSON al service account-ului → extrage `client_email` si `private_key`
2. Construieste JWT cu:
   - `iss`: client_email
   - `scope`: "https://www.googleapis.com/auth/drive.readonly"
   - `aud`: "https://oauth2.googleapis.com/token"
   - `exp`: now + 3600
   - `iat`: now
3. Semneaza cu private_key (RS256)
4. POST la `https://oauth2.googleapis.com/token` cu `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}`
5. Foloseste `access_token` din raspuns ca Bearer pe API-uri

Token-ul are TTL 1h. Cache in memorie + refresh la nevoie.

# Notes

- Skill-ul e read-only intentionat (rol "Viewer"). Pentru upload/edit fa un skill separat `tool-drive-write`.
- Limita rate Drive API: 1000 query/100s/user. Pentru bulk operations adauga backoff exponential.
- Service account-ul nu vede fisiere private — necesar share explicit. Cand un fisier e cerut si returneaza 404, sugereaza userului sa verifice sharing-ul.
