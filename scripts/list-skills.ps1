# Thin wrapper — delega la cross-platform list-skills.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/list-skills.js" $Args
exit $LASTEXITCODE
