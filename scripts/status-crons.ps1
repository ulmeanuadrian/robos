# Thin wrapper — delega la cross-platform status-crons.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/status-crons.js" $Args
exit $LASTEXITCODE
