# Thin wrapper — delega la cross-platform stop-crons.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/stop-crons.js" $Args
exit $LASTEXITCODE
