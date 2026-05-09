# Test Environment Toolkit

Tooling pentru creare, gestiune si cleanup de medii de test izolate pentru robOS pe **acelasi laptop** ca dev install. **Nu se livreaza la studenti** (export-ignore in `.gitattributes`).

## De ce

Vrei sa:
- Testezi tarball-uri noi (v0.5.x, v0.6.x) **fara sa atingi dev install-ul** la `c:\claude_os\robos`
- Repeti testul "fresh student" cand schimbi welcomeEmail / wrappers / setup logic
- Ai mai multe variante de test simultan (un test pe v0.5.0 + alt test pe v0.5.1 cu fix)

## Locatie

```
%USERPROFILE%\robos-tests\
  active\
    test-001\robOS\        ← v0.5.0, port 3002
    test-002\robOS\        ← v0.5.0, port 3003
    v0.5.0-uat\robOS\      ← named test
```

Configurabil cu `-TestRoot <path>` pe orice script.

## Comenzi

| Scop | PowerShell | cmd |
|---|---|---|
| Creeaza test nou | `.\scripts\test-env\new.ps1` | `scripts\test-env\new.cmd` |
| Listeaza | `.\scripts\test-env\list.ps1` | `scripts\test-env\list.cmd` |
| Cleanup unul | `.\scripts\test-env\cleanup.ps1 -Name test-001` | `scripts\test-env\cleanup.cmd -Name test-001` |
| Cleanup tot | `.\scripts\test-env\cleanup.ps1 -All -Force` | `scripts\test-env\cleanup.cmd -All -Force` |

## new.ps1 — flags

| Flag | Default | Effect |
|---|---|---|
| `-Name <str>` | `test-NNN` auto-incrementat | Nume custom (ex: `v0.5.0-uat`) |
| `-Port <int>` | `3001 + N` (deci 3002, 3003...) | Port custom |
| `-Source <path>` | cea mai recenta din `licensing\build\` | Tarball custom |
| `-TestRoot <path>` | `%USERPROFILE%\robos-tests` | Locatie custom container |

## Workflow tipic

```powershell
# 1. Creeaza test
.\scripts\test-env\new.ps1
# Output: "Mediu test creat: test-001 (v0.5.0)"
# +instructiuni cd + lansare

# 2. cd in locatia data + lansare
cd $env:USERPROFILE\robos-tests\active\test-001\robOS
scripts\robos.cmd

# 3. Test functionalitate (alt terminal)
cd $env:USERPROFILE\robos-tests\active\test-001\robOS
claude
# > onboard me
# (test full flow)

# 4. Status check oricand
.\scripts\test-env\list.ps1

# 5. Cand termini
.\scripts\test-env\cleanup.ps1 -Name test-001
```

## Licensing — bind real obligatoriu

Test envs fac bind real (nu mai exista mecanism de skip). Hook-ul citeste `~/.robos/license.jwt`. Pe acelasi laptop e jwt-ul instalarii dev → test-ul **foloseste licenta dev**.

Daca vrei sa testezi un bind nou cu o licenta proaspata:
1. Genereaza licenta noua prin `https://admin.robos.vip/`
2. Copiaza seed JWT-ul nou (descarcat de la `dl.robos.vip/{token}`) ca `.license-stamp` in `test-NNN/robOS/` INAINTE de setup
3. Backup `~/.robos/license.jwt` → ceva tip `.dev-backup` (script-ul NU face asta automat — manual)
4. Restaureaza dupa test

## Edge cases

- **Tarball lipsa**: `new.ps1` cauta in `c:\claude_os\robos\licensing\build\robos-base-v*.tar.gz`. Daca lipseste: `Write-Fail` cu instructiuni pentru rebuild.
- **Folder existent**: `new.ps1` refuza sa suprascrie. Foloseste cleanup intai.
- **Dashboard pornit la cleanup**: `cleanup.ps1` detecteaza PID din `.command-centre\server.pid` si `Stop-Process` inainte de delete.
- **Port deja folosit**: explicit `-Port` override-uieste auto-pick. `list.ps1` arata ce porturi sunt deja folosite.

## Mac/Linux

`new.sh`, `cleanup.sh`, `list.sh` sunt echivalentele bash (TBD daca ai nevoie). Logica identica.
