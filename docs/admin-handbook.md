# robOS — Admin Handbook

Ghid pentru **tine** (Adrian) ca administrator robOS. Acopera lifecycle-ul complet: emitere licente, suport, deploy de versiuni noi, monitoring, refund.

> Acest fisier e **maintainer-only** — `.gitattributes` cu `docs/internal/` export-ignore (TBD: muta aici daca decizi). Nu e shipuit la studenti.

---

## 1. Infrastructura — ce ruleaza unde

```
                         ┌───────────────────────────────────┐
                         │   Cloudflare (gestionat de tine)   │
                         │                                   │
   Student ──HTTPS──────►│   api.robos.vip   (Worker)        │
                         │   admin.robos.vip (Worker SPA)    │
                         │   dl.robos.vip    (Worker)        │
                         │                                   │
                         │   D1: robos-licenses              │
                         │   R2: robos-tarballs              │
                         │   KV: CACHE                       │
                         └───────────────────────────────────┘

                         ┌───────────────────────────────────┐
                         │   robos.vip   (landing static)    │
                         │   Cloudflare Pages sau orice CDN  │
                         └───────────────────────────────────┘
```

**Cod sursa Worker**: `licensing/` din repo (nu shipuit la studenti via .gitattributes export-ignore).

**Deploy Worker**: `cd licensing && wrangler deploy`.

**Build local Worker**: nimic — Worker-ul e single-file ESM, deploy direct.

---

## 2. Emitere licenta — 2 cai

### 2a. Manual prin admin dashboard

URL: `https://admin.robos.vip/?token=<LICENSE_INTERNAL_API_TOKEN>`

Token-ul e in `.env` la `LICENSE_INTERNAL_API_TOKEN` (sau in wrangler secrets — sursa unica de adevar e wrangler).

Salveaza URL-ul ca **bookmark** in browser. Click → cookie 24h → redirect la `/`.

**Workflow**:
1. Click bookmark → admin SPA
2. Tab Licente → buton "Create license"
3. Form: email + tier (`standard`) + amount_cents (19700) + source (`manual` / `stripe` / `transfer`) + source_ref (e.g., Stripe charge ID sau "WhatsApp 2026-05-07")
4. Submit → primesti `{license_id, download_url, download_token}`
5. Copy `download_url`, trimite-l la student prin email manual sau WhatsApp

### 2b. Automat prin payment app (cand integrezi)

Payment app extern (Stripe webhook, etc.) face POST direct:

```bash
curl -X POST https://api.robos.vip/internal/licenses/create \
  -H "Authorization: Bearer ${LICENSE_INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "tier": "standard",
    "amount_cents": 19700,
    "source": "stripe",
    "source_ref": "ch_3OqK2x...",
    "bundle_with_fda": false,
    "notes": "auto from stripe webhook"
  }'
```

Response identic cu 2a. Payment app trimite welcome email cu `download_url` (template: `licensing/src/lib/email.js → welcomeEmail()`).

---

## 3. Suport — probleme comune student

### "Linkul a expirat"
Download tokens expiraza la 7 zile (multi-use). Student cere link nou:
1. Admin dashboard → cauta licenta dupa email
2. Detail license → buton "Issue new download token"
3. Copy URL nou, trimite la student

### "Hardware mismatch dupa schimbat laptop"

Worker accepta rebind silent pana la threshold (5 in 90 zile). Daca depaseste:
1. Admin dashboard → license → tab "Binds" → vezi istoric
2. Daca legitim (laptop nou), apesi "Approve rebind" → reset threshold
3. Daca abuz (3+ laptops in scurt timp), `Revoke license`

### "License expired" / refresh failed

Refresh window e 60-90 zile. Daca student offline >30 zile dupa expirare:
1. Cere-i sa stearga `~/.robos/license.jwt`
2. Re-descarca tarball-ul (download token nou)
3. La primul prompt face bind cu seed JWT proaspat

### "Setup esueaza la npm install"

Probabil internet lent / npm registry probleme. Cere-i sa ruleze:
```
rm -rf centre/node_modules
node scripts/setup.js
```

Daca persista: verifica ca `node --version >= 20` si `claude --version` raspunde.

---

## 4. Deploy versiune noua

### Workflow standard pentru v0.X.Y → v0.X.Y+1

```bash
# 1. Bump VERSION + changelog
echo "0.5.1" > VERSION
# Edit CHANGELOG.md cu entry nou

# 2. Build tarball local (test)
node licensing/scripts/build-base-tarball.js
# Verifica: licensing/build/robos-base-v0.5.1.tar.gz

# 3. Test pe extract proaspat (folosind toolkit-ul intern)
scripts\test-env\new.cmd  # Windows
# sau:
bash scripts/test-env/new.sh  # Mac/Linux (TBD)

# 4. Commit + push
git add VERSION CHANGELOG.md
git commit -m "chore(release): bump VERSION to 0.5.1"
git push origin main

# 5. Upload R2
cd licensing
wrangler r2 object put robos-tarballs/robos-base-v0.5.1.tar.gz \
  --file=build/robos-base-v0.5.1.tar.gz --remote

# 6. Bump Worker config + deploy
# Edit wrangler.toml: CURRENT_ROBOS_VERSION = "0.5.1"
git add licensing/wrangler.toml
git commit -m "chore(release): wrangler.toml CURRENT_ROBOS_VERSION = 0.5.1"
git push origin main

wrangler deploy
```

### Verificare post-deploy

```bash
# Health check
curl https://api.robos.vip/health
# Expect: {"ok":true,"version":"0.5.1"}

# Version endpoint
curl https://api.robos.vip/version
# Expect: {"current_version":"0.5.1","minimum_version":"0.4.0",...}

# Test download cu un download_token existent (NU urca file efectiv, vezi headers)
curl -I https://dl.robos.vip/<test-token>
# Expect: Content-Disposition: attachment; filename="robos-0.5.1.tar.gz"
```

### Migration path pentru studentii existenti

Studentii NU primesc update automat. Au 2 optiuni:

1. **`node scripts/update.js`** (in-place) — descarca tarball nou autentificat cu JWT-ul lor, aplica preservand brand/, context/, projects/, .env.
2. **Email manual de notificare** — opt-in: scrii la lista de cumparatori "v0.5.1 disponibil, ruleaza node scripts/update.js sau cere-mi link de download fresh".

`update.js` e mai bun ca UX. Email-ul de notificare e necesar daca update-ul e major (breaking change, schema migration mare, feature nou worth-promoting).

### Cleanup tarballs vechi din R2

Optional, dupa ce confirmi ca nimeni nu mai foloseste o versiune veche:

```bash
wrangler r2 object delete robos-tarballs/robos-base-v0.4.0.tar.gz
wrangler r2 object delete robos-tarballs/robos-base-v0.4.1.tar.gz
```

**ATENTIE**: download tokens emise pe versiuni vechi devin invalide. Pentru v0.x stable, **PASTREAZA** ultimele 2-3 versiuni in R2 ca rollback path.

---

## 5. Refund / revoke

### Refund

1. Inapoiezi banii prin payment processor (Stripe / transfer / etc.)
2. Admin dashboard → cauta licenta dupa email
3. Buton "Revoke" → status `active` → `revoked` in D1
4. La urmatorul refresh JWT (max 60 zile), JWT-ul devine invalid pe device-ul student
5. Hook `license-check.js` returneaza eroare `license_revoked`, blocheaza promptul

### Revoke fara refund (abuz / fraud)

Acelasi flow ca refund dar fara plata inapoi. Documenteaza in `notes` field din license row pentru audit trail.

---

## 6. Monitoring

### Daily / weekly

**Admin dashboard `/admin/api/stats`** sau direct:

```bash
curl -H "Cookie: robos_admin_session=..." https://admin.robos.vip/admin/api/stats
# Returns: { total, active, revoked, expired, total_revenue_cents, ... }
```

### Event log per licenta

Admin → license detail → tab Events. Tipuri event_type:

| Event | Cand |
|---|---|
| `download` | Student descarca tarball |
| `bind` | Primul prompt pe device nou |
| `refresh` | Auto la 60d din 90d (background) |
| `rebind` | Schimba laptop, sub threshold |
| `verify_failed` | License invalida (ex: revoked, hardware mismatch peste threshold) |
| `update_token_issued` | Student a folosit `update.js` |
| `admin_login` | Tu ai accesat admin dashboard |

### Anomalii de urmarit

- **Multiple binds active per licenta**: 1 = normal, 2 = laptop schimbat, 3+ = posibil partajare tarball. Investigheaza.
- **Verify failures repeated**: posibil tampering — verifica IP + user_agent in event log.
- **Download tokens consumed >10 ori in 24h**: posibil scraping. Monitor.
- **JWT din locatii geografice diferite**: legitim daca student calatoreste, suspect daca apar simultan.

### Cloudflare logs

```bash
cd licensing
wrangler tail
# Live tail al request-urilor catre Worker. Util pentru debugging.
```

---

## 7. Backup + Disaster Recovery

### Ce sa nu pierzi

| Item | Locatie | Backup strategy |
|---|---|---|
| **D1 database** (licenses + binds + events) | Cloudflare D1 | `wrangler d1 export robos-licenses --output backup-YYYY-MM-DD.sql` saptamanal |
| **JWT private key** | `data/keys/jwt-private.pem` (LOCAL) + wrangler secret | Pastrat OFFLINE pe USB encrypted. Daca pierzi, **toate licentele se invalideaza la urmatorul refresh** |
| **JWT public key** | embedded in `scripts/license-check.js` + wrangler secret | Re-derivable din private key |
| **Tarballs R2** | Cloudflare R2 | Optional: weekly `wrangler r2 object get` cele active local |
| **Source code** | `c:\claude_os\robos\` git | Push regular la origin (GitHub) |
| **Stripe / payment records** | Stripe dashboard | Stripe pastreaza istoricul oricum |

### Rotation JWT keys (urgent breach)

```bash
# 1. Genereaza pereche noua
node licensing/scripts/generate-jwt-keys.js
# Output: data/keys/jwt-private.pem si jwt-public.pem

# 2. Update PUBLIC_KEY_BASE64 in scripts/license-check.js
# Editeaza linia ~26 cu noua cheie publica (printata la generate)

# 3. Upload private key la wrangler secrets
cat data/keys/jwt-private.pem | wrangler secret put LICENSE_JWT_PRIVATE_KEY
cat data/keys/jwt-public.pem | wrangler secret put LICENSE_JWT_PUBLIC_KEY

# 4. Deploy Worker + commit + push
wrangler deploy
git add scripts/license-check.js
git commit -m "chore(security): rotate Ed25519 keys"
git push

# 5. Studentii fac rebind automat la urmatorul prompt
# (vechiul JWT nu mai valideaza cu cheia noua publica → tryFirstRunBind ruleaza din nou)
```

**Cost**: rotation = toti studentii pierd JWT-ul curent → la primul prompt urmator fac rebind automat (sub threshold). Acceptable pentru rotation planuita.

---

## 8. Toolkit local

### `scripts/test-env/` — medii de test izolate

Pentru testare iterativa pe acelasi laptop:

```cmd
scripts\test-env\new.cmd                       # creez test-NNN, port auto
scripts\test-env\list.cmd                      # vezi medii active
scripts\test-env\cleanup.cmd -Name test-001    # cleanup unul
scripts\test-env\cleanup.cmd -All -Force       # cleanup tot
```

Bind real obligatoriu. Test envs folosesc `~/.robos/license.jwt` al instalarii dev (sau `.license-stamp` proaspat copiat in test folder inainte de setup).

### `licensing/scripts/build-base-tarball.js`

Build tarball nou local (test inainte de upload R2). Output in `licensing/build/robos-base-v{VERSION}.tar.gz`.

### `licensing/scripts/generate-jwt-keys.js`

Genereaza pereche Ed25519 nou (rar — doar la setup initial sau rotation).

---

## 9. Limitari cunoscute / TODO

- **Rate limiting**: niciun rate limit pe `/bind`, `/refresh`. Pentru abuz, monitor manual + revoke. KV namespace `CACHE` rezervat pentru rate limiting future.
- **Email automation**: Worker NU trimite email — payment app extern face. Integrare cu Resend posibila prin `licensing/src/lib/email.js → sendEmail()` daca decizi.
- **Refund partial**: nu suportat. Doar revoke complet.
- **Multi-user same license**: prevenit prin hardware fingerprint, dar partajare prin VM identice posibila — monitor multiple_active_binds events.

---

## 10. Resurse

- **Cod sursa Worker**: [licensing/](../licensing/)
- **Schema D1**: [licensing/schema.sql](../licensing/schema.sql)
- **Welcome email template**: [licensing/src/lib/email.js](../licensing/src/lib/email.js) → `welcomeEmail()`
- **Build tarball**: [licensing/scripts/build-base-tarball.js](../licensing/scripts/build-base-tarball.js)
- **Wrangler config**: [licensing/wrangler.toml](../licensing/wrangler.toml)
- **Decision journal** (decizii non-triviale): [context/decision-journal.md](../context/decision-journal.md)

---

**Versiune doc:** 1.0
**Acopera robOS:** v0.5.x
