# robOS Licensing System

Cloudflare Worker care emite, valideaza si gestioneaza licente robOS.

## Arhitectura

| Componenta | Rol |
|------------|-----|
| **Worker `robos-api`** | Endpoints HTTP pentru bind/refresh/rebind/verify/download/admin |
| **D1 `robos-licenses`** | Tabele: licenses, binds, events, magic_links, admin_sessions, download_tokens |
| **R2 `robos-tarballs`** | `robos-base-v{X}.tar.gz` (un fisier per versiune majora) |
| **KV `CACHE`** | Reserved pentru rate limiting / cache (neutilizat in V1) |

## Endpoints

### Public

- `GET https://api.robos.vip/health` → `{ok, version}`
- `POST https://api.robos.vip/bind` → primul-run, schimba seed JWT pe bound JWT
- `POST https://api.robos.vip/refresh` → reinnoieste JWT (la 60d din 90d)
- `POST https://api.robos.vip/rebind` → schimba hardware (cu threshold)
- `POST https://api.robos.vip/verify` → check rapid pentru revocare
- `GET https://dl.robos.vip/{token}` → download tarball stamped

### Internal (auth: Bearer LICENSE_INTERNAL_API_TOKEN)

- `POST https://api.robos.vip/internal/licenses/create`

### Admin (auth: cookie din `/auth?token=...`)

- `GET https://admin.robos.vip/` → dashboard SPA
- `GET https://admin.robos.vip/?token=XXX` sau `/auth?token=XXX` → login → cookie 24h
- `GET https://admin.robos.vip/logout`
- `GET /admin/api/stats`
- `GET /admin/api/licenses?q=...&limit=...&offset=...`
- `GET /admin/api/license/{id}`
- `POST /admin/api/license/{id}/revoke`
- `POST /admin/api/licenses/create`

## Integrare cu payment app

Payment app-ul tau (extern, separat de Worker) face:

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
    "notes": "automated from payment app"
  }'
```

Response:

```json
{
  "ok": true,
  "license_id": "bef07364-5ce3-4ff3-a068-2e564c993707",
  "download_url": "https://dl.robos.vip/81b9d9c11adb487c325e050379443ce7",
  "download_token": "81b9d9c11adb487c325e050379443ce7"
}
```

Apoi payment app trimite welcome email **prin SMTP-ul propriu** cu `download_url` inclus.
Template de referinta in `src/lib/email.js → welcomeEmail()`.

### Refund flow (cand implementezi)

```bash
curl -X POST https://api.robos.vip/admin/api/license/${LICENSE_ID}/revoke \
  -H "Cookie: robos_admin_session=..."
```

Sau implementeaza un endpoint internal `/internal/licenses/revoke` (TBD).

## Build & Deploy

```bash
# Generate Ed25519 keys (o data, pastreaza fisierele in data/keys/)
node licensing/scripts/generate-jwt-keys.js

# Build robos-base tarball din repo (foloseste git archive + strip terminator)
node licensing/scripts/build-base-tarball.js

# Upload tarball la R2
cd licensing
wrangler r2 object put robos-tarballs/robos-base-v0.4.0.tar.gz \
  --file=build/robos-base-v0.4.0.tar.gz --remote

# Set secrets (o data, sau cand rotezi)
cat ../data/keys/jwt-private.pem | wrangler secret put LICENSE_JWT_PRIVATE_KEY
cat ../data/keys/jwt-public.pem | wrangler secret put LICENSE_JWT_PUBLIC_KEY
echo "$LICENSE_INTERNAL_API_TOKEN" | wrangler secret put LICENSE_INTERNAL_API_TOKEN

# Deploy
wrangler deploy
```

## Rotatia cheilor

Daca rotezi Ed25519:

1. `rm data/keys/*` (sterge cele vechi)
2. `node licensing/scripts/generate-jwt-keys.js` → genereaza pereche noua
3. Update `PUBLIC_KEY_BASE64` in `scripts/license-check.js` cu noua cheie publica (tiparita la generare)
4. `cat data/keys/jwt-private.pem | wrangler secret put LICENSE_JWT_PRIVATE_KEY` (overwrite)
5. `wrangler deploy`
6. **Toti userii existenti devin invalidati** (JWT-urile vechi nu mai verifica). La urmatoarea rulare, hook-ul lor face rebind cu cheia publica noua. Acceptabil pentru rotatie planuificata.

## Versionare robOS

Cand lansezi v0.5.0, v0.6.0, etc.:

1. Build tarball: `node licensing/scripts/build-base-tarball.js` (citeste `VERSION`)
2. Upload: `wrangler r2 object put robos-tarballs/robos-base-v0.5.0.tar.gz --file=...`
3. Update `wrangler.toml` `[vars] CURRENT_ROBOS_VERSION = "0.5.0"`
4. `wrangler deploy`
5. Userii cu `version_entitlement = '1'` continua sa primeasca v0.5.0 (toate v0.x sunt entitlement '1').
6. Pentru v1.0 → entitlement '2' → user trebuie sa ia bilet nou (sau upgrade path TBD).

## Hook local (`scripts/license-check.js`)

Ruleaza la fiecare prompt din hook-ul `UserPromptSubmit`. Validare offline cu cheia publica embedded. Network call doar la:
- Primul-run (bind)
- Refresh (la 60d din 90d)
- Hardware change (rebind)

Dev mode: setezi `ROBOS_DEV=1` in `.env` → hook-ul intoarce `ok=true` fara verificare. Doar pentru autorul robOS, nu documentat in `.env.example` DISTRIBUTION.
