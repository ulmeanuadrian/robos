# Thin wrapper — delega la cross-platform add-skill.js
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)
& node "$PSScriptRoot/add-skill.js" $Args
exit $LASTEXITCODE
