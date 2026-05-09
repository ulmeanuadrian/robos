# scripts/test-env/new.ps1 — Creeaza un mediu de test izolat pentru robOS.
#
# Locatie default: %USERPROFILE%\robos-tests\active\test-NNN\robOS\
# Port: auto-incrementat (3002, 3003, ...) — niciodata 3001 (rezervat dev install)
# Licensing: bind real cu ~/.robos/license.jwt al instalarii dev.
#   Pentru test cu licenta proaspata: copiaza .license-stamp generat in test-folder/robOS/ INAINTE de setup.
# Sursa: cea mai recenta tarball din C:\claude_os\robos\licensing\build\robos-base-v*.tar.gz
#
# Usage:
#   .\scripts\test-env\new.ps1                    # auto name, auto port
#   .\scripts\test-env\new.ps1 -Name "v0.5.0-uat" # custom name
#   .\scripts\test-env\new.ps1 -Port 3010         # custom port
#   .\scripts\test-env\new.ps1 -Source path       # custom tarball

[CmdletBinding()]
param(
    [string]$Name,
    [int]$Port = 0,
    [string]$Source,
    [string]$TestRoot = (Join-Path $env:USERPROFILE 'robos-tests')
)
$ErrorActionPreference = 'Stop'

# Helpers
function Write-Info($msg)    { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg)    { Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

# Locate latest tarball
if (-not $Source) {
    $buildDir = 'C:\claude_os\robos\licensing\build'
    if (-not (Test-Path $buildDir)) {
        Write-Fail "Nu gasesc folder-ul build: $buildDir"
    }
    $tarballs = Get-ChildItem $buildDir -Filter 'robos-base-v*.tar.gz' |
                Sort-Object LastWriteTime -Descending
    if (-not $tarballs) {
        Write-Fail "Niciun tarball in $buildDir. Ruleaza: node licensing\scripts\build-base-tarball.js"
    }
    $Source = $tarballs[0].FullName
}
if (-not (Test-Path $Source)) { Write-Fail "Tarball lipsa: $Source" }

# Determine name + port
$activeDir = Join-Path $TestRoot 'active'
if (-not (Test-Path $activeDir)) { New-Item -ItemType Directory -Path $activeDir -Force | Out-Null }

if (-not $Name) {
    $existing = Get-ChildItem $activeDir -Directory -ErrorAction SilentlyContinue |
                Where-Object Name -match '^test-(\d{3})$' |
                ForEach-Object { [int]($_.Name -replace '^test-','') }
    $next = if ($existing) { ($existing | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    $Name = "test-{0:D3}" -f $next
}
if ($Port -eq 0) {
    if ($Name -match '^test-(\d{3})$') {
        $Port = 3001 + [int]$matches[1]
    } else {
        # Find first available port from 3010 up
        $used = Get-ChildItem $activeDir -Directory -ErrorAction SilentlyContinue |
                ForEach-Object {
                    $envFile = Join-Path $_.FullName 'robOS\.env'
                    if (Test-Path $envFile) {
                        $line = (Get-Content $envFile | Where-Object { $_ -match '^PORT\s*=\s*(\d+)' })
                        if ($line) { [int]($line -replace '^PORT\s*=\s*','') }
                    }
                }
        $Port = 3010
        while ($Port -in $used) { $Port++ }
    }
}

$testDir = Join-Path $activeDir $Name
if (Test-Path $testDir) {
    Write-Fail "Test '$Name' exista deja: $testDir`nRuleaza cleanup.ps1 -Name $Name sau alege alt nume."
}

# Build test environment
Write-Info "Creez mediu test: $testDir"
Write-Info "Sursa tarball: $(Split-Path -Leaf $Source)"
Write-Info "Port: $Port"
Write-Info "Mod licenta: REAL bind (foloseste ~/.robos/license.jwt sau .license-stamp daca-l copiezi inainte de setup)"
Write-Host ""

New-Item -ItemType Directory -Path $testDir -Force | Out-Null
Copy-Item $Source $testDir
$tarballName = Split-Path -Leaf $Source

Push-Location $testDir
try {
    & tar -xzf $tarballName
    if ($LASTEXITCODE -ne 0) { Write-Fail "tar extract esuat" }
    Remove-Item $tarballName
} finally {
    Pop-Location
}

$robosDir = Join-Path $testDir 'robOS'
if (-not (Test-Path $robosDir)) { Write-Fail "robOS/ nu s-a creat dupa extract" }

# Pre-configure .env from .env.example
$envExample = Join-Path $robosDir '.env.example'
$envFile = Join-Path $robosDir '.env'
$content = Get-Content $envExample -Raw
$content = $content -replace 'PORT=3001', "PORT=$Port"
[System.IO.File]::WriteAllText($envFile, $content)

# Build summary
$version = (Get-Content (Join-Path $robosDir 'VERSION')).Trim()

Write-Ok "Mediu test creat: $Name (v$version)"
Write-Host ""
Write-Host "Locatie:" -ForegroundColor Yellow
Write-Host "  $robosDir"
Write-Host ""
Write-Host "Lansare:" -ForegroundColor Yellow
Write-Host "  cd `"$robosDir`""
Write-Host "  scripts\robos.cmd"
Write-Host ""
Write-Host "Chat cu Claude (alt terminal):" -ForegroundColor Yellow
Write-Host "  cd `"$robosDir`""
Write-Host "  claude"
Write-Host "  > onboard me"
Write-Host ""
Write-Host "Dashboard URL:" -ForegroundColor Yellow
Write-Host "  http://localhost:$Port"
Write-Host ""
Write-Host "Cleanup cand termini:" -ForegroundColor Yellow
Write-Host "  C:\claude_os\robos\scripts\test-env\cleanup.ps1 -Name $Name"
