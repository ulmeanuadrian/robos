@echo off
REM robOS update — Windows cmd wrapper. Delega la node scripts/update.js
where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 20.
  echo Ruleaza: winget install OpenJS.NodeJS.LTS
  exit /b 1
)
node "%~dp0update.js" %*
