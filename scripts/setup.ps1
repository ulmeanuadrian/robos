# robOS setup — PowerShell wrapper. Delega la node scripts/setup.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js nu e instalat. Instaleaza de la https://nodejs.org"
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupJs = Join-Path $scriptDir 'setup.js'

& $node.Source $setupJs $Args
exit $LASTEXITCODE
