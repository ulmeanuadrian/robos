# robOS launcher — PowerShell wrapper. Delega la node scripts/robos.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "EROARE: Node.js nu e instalat. robOS necesita Node >= 22.12.0." -ForegroundColor Red
    Write-Host ""
    Write-Host "Optiuni instalare:"
    Write-Host "  - cu winget: winget install OpenJS.NodeJS.LTS"
    Write-Host "  - .msi direct: https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi"
    Write-Host "  - alta versiune: https://nodejs.org (LTS, descarca installer >= 22.12)"
    Write-Host "Dupa instalare, deschide o fereastra noua de PowerShell si reincearca."
    exit 1
}

$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) {
    Write-Host "EROARE: Claude Code CLI nu e instalat. robOS ruleaza prin Claude Code." -ForegroundColor Red
    Write-Host "Ruleaza: irm https://claude.ai/install.ps1 | iex"
    Write-Host "Dupa instalare, deschide o fereastra noua de PowerShell si reincearca."
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$robosJs = Join-Path $scriptDir 'robos.js'

& $node.Source $robosJs $Args
exit $LASTEXITCODE
