@echo off
REM robOS launcher — Windows wrapper. Delega la node scripts/robos.js

where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 22.12.0.
  echo.
  echo Optiuni instalare:
  echo   - cu winget: winget install OpenJS.NodeJS.LTS
  echo   - .msi direct: https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi
  echo   - alta versiune: https://nodejs.org ^(LTS, descarca installer ^>= 22.12^)
  echo.
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
