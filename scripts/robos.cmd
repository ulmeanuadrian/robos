@echo off
REM robOS launcher — Windows wrapper. Delega la node scripts/robos.js

where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 20.
  echo Ruleaza: winget install OpenJS.NodeJS.LTS
  echo Dupa instalare, deschide o fereastra noua de terminal si reincearca.
  exit /b 1
)

where claude >nul 2>nul
if errorlevel 1 (
  echo EROARE: Claude Code CLI nu e instalat. robOS ruleaza prin Claude Code.
  echo Ruleaza in PowerShell: irm https://claude.ai/install.ps1 ^| iex
  echo Dupa instalare, deschide o fereastra noua de terminal si reincearca.
  exit /b 1
)

node "%~dp0robos.js" %*
