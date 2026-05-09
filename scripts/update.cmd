@echo off
REM robOS update — Windows cmd wrapper. Delega la node scripts/update.js
where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 22.12.0.
  echo Instalare: winget install OpenJS.NodeJS.LTS  ^(sau https://nodejs.org^)
  exit /b 1
)
node "%~dp0update.js" %*
