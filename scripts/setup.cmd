@echo off
REM robOS setup — Windows wrapper. Delega la scripts/setup.js (cross-platform).
where node >nul 2>nul
if errorlevel 1 (
  echo EROARE: Node.js nu e instalat. robOS necesita Node ^>= 20.
  echo Instaleaza de la https://nodejs.org
  exit /b 1
)
node "%~dp0setup.js" %*
