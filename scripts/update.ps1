# robOS update — PowerShell wrapper. Delega la node scripts/update.js
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
$updateJs = Join-Path $scriptDir 'update.js'

& $node.Source $updateJs $Args
exit $LASTEXITCODE
