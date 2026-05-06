# robOS launcher — PowerShell wrapper. Delega la node scripts/robos.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js nu e instalat. robOS necesita Node >= 20. Instaleaza de la https://nodejs.org"
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$robosJs = Join-Path $scriptDir 'robos.js'

& $node.Source $robosJs $Args
exit $LASTEXITCODE
