# scripts/test-env/cleanup.ps1 — Sterge un mediu test (sau toate).
#
# Usage:
#   .\scripts\test-env\cleanup.ps1 -Name test-001
#   .\scripts\test-env\cleanup.ps1 -All
#   .\scripts\test-env\cleanup.ps1 -All -Force   # fara confirmare

[CmdletBinding()]
param(
    [string]$Name,
    [switch]$All,
    [switch]$Force,
    [string]$TestRoot = (Join-Path $env:USERPROFILE 'robos-tests')
)
$ErrorActionPreference = 'Stop'

function Write-Info($msg)    { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Skip($msg)    { Write-Host "[SKIP] $msg" -ForegroundColor DarkGray }
function Write-Fail($msg)    { Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

if (-not $Name -and -not $All) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  cleanup.ps1 -Name test-NNN"
    Write-Host "  cleanup.ps1 -All [-Force]"
    exit 1
}

$activeDir = Join-Path $TestRoot 'active'
if (-not (Test-Path $activeDir)) {
    Write-Skip "Niciun mediu de test la $activeDir"
    exit 0
}

# Stop dashboard if running, then remove folder
function Remove-Test($testFolder) {
    $robosDir = Join-Path $testFolder 'robOS'
    $pidFile = Join-Path $robosDir '.command-centre\server.pid'

    if (Test-Path $pidFile) {
        $pidContent = (Get-Content $pidFile -Raw).Trim()
        if ($pidContent -match '^\d+$') {
            $pid = [int]$pidContent
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Info "Opresc dashboard PID $pid din $(Split-Path -Leaf $testFolder)"
                try {
                    Stop-Process -Id $pid -Force -ErrorAction Stop
                    Start-Sleep -Milliseconds 500
                } catch {
                    Write-Skip "Nu pot opri PID $pid — continui oricum"
                }
            }
        }
    }

    Remove-Item -Recurse -Force $testFolder
    Write-Ok "Sters: $(Split-Path -Leaf $testFolder)"
}

if ($All) {
    $tests = Get-ChildItem $activeDir -Directory -ErrorAction SilentlyContinue
    if (-not $tests) {
        Write-Skip "Nimic de sters."
        exit 0
    }
    if (-not $Force) {
        Write-Host "Voi sterge $($tests.Count) test(e):" -ForegroundColor Yellow
        $tests | ForEach-Object { Write-Host "  - $($_.Name)" }
        $confirm = Read-Host "Confirma (y/N)"
        if ($confirm -notmatch '^y(es)?$') {
            Write-Host "Anulat."
            exit 0
        }
    }
    foreach ($test in $tests) { Remove-Test $test.FullName }
} else {
    $testFolder = Join-Path $activeDir $Name
    if (-not (Test-Path $testFolder)) {
        Write-Fail "Nu gasesc test '$Name' in $activeDir"
    }
    Remove-Test $testFolder
}
