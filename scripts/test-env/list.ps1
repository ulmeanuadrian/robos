# scripts/test-env/list.ps1 — Listeaza medii de test active.
#
# Output: Name, Version, Port, Dashboard status

[CmdletBinding()]
param(
    [string]$TestRoot = (Join-Path $env:USERPROFILE 'robos-tests')
)
$ErrorActionPreference = 'Stop'

$activeDir = Join-Path $TestRoot 'active'
if (-not (Test-Path $activeDir)) {
    Write-Host "Niciun mediu test la $activeDir" -ForegroundColor DarkGray
    exit 0
}

$tests = Get-ChildItem $activeDir -Directory -ErrorAction SilentlyContinue
if (-not $tests) {
    Write-Host "Nicio rulare activa." -ForegroundColor DarkGray
    exit 0
}

Write-Host ""
Write-Host ("{0,-20} {1,-8} {2,-6} {3}" -f 'Name', 'Version', 'Port', 'Dashboard') -ForegroundColor Yellow
Write-Host ("-" * 55)

foreach ($test in $tests) {
    $robosDir = Join-Path $test.FullName 'robOS'
    if (-not (Test-Path $robosDir)) { continue }

    # Version
    $versionFile = Join-Path $robosDir 'VERSION'
    $version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { '?' }

    # Port from .env
    $envFile = Join-Path $robosDir '.env'
    $port = '?'
    if (Test-Path $envFile) {
        $portLine = Get-Content $envFile | Where-Object { $_ -match '^PORT\s*=\s*(\d+)' }
        if ($portLine) { $port = ($portLine -replace '^PORT\s*=\s*','').Trim() }
    }

    # Dashboard status
    $pidFile = Join-Path $robosDir '.command-centre\server.pid'
    $status = 'down'
    if (Test-Path $pidFile) {
        $pidContent = (Get-Content $pidFile -Raw).Trim()
        if ($pidContent -match '^\d+$') {
            $pid = [int]$pidContent
            if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                $status = "up (PID $pid)"
            }
        }
    }

    Write-Host ("{0,-20} {1,-8} {2,-6} {3}" -f $test.Name, "v$version", $port, $status)
}
Write-Host ""
