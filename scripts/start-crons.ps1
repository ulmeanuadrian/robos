# Thin wrapper — delega la cross-platform start-crons.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/start-crons.js" $Args
exit $LASTEXITCODE
