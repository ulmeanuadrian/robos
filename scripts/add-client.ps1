# Thin wrapper — delega la cross-platform add-client.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/add-client.js" $Args
exit $LASTEXITCODE
