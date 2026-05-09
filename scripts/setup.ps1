# robOS setup — PowerShell wrapper. Delega la node scripts/setup.js
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
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupJs = Join-Path $scriptDir 'setup.js'

& $node.Source $setupJs $Args
exit $LASTEXITCODE
