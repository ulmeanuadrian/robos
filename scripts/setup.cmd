@echo off
REM robOS setup — Windows wrapper. Delega la scripts/setup.js (cross-platform).
where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 20.
  echo Ruleaza: winget install OpenJS.NodeJS.LTS
  echo Dupa instalare, deschide o fereastra noua de terminal si reincearca.
  exit /b 1
)
node "%~dp0setup.js" %*
