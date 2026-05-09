# robOS update — PowerShell wrapper. Delega la node scripts/update.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "EROARE: Node.js nu e instalat. robOS necesita Node >= 22.12.0." -ForegroundColor Red
    Write-Host "Instalare: winget install OpenJS.NodeJS.LTS  (sau https://nodejs.org)"
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$updateJs = Join-Path $scriptDir 'update.js'

& $node.Source $updateJs $Args
exit $LASTEXITCODE
