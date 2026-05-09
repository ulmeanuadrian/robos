# Thin wrapper — delega la cross-platform remove-skill.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/remove-skill.js" $Args
exit $LASTEXITCODE
