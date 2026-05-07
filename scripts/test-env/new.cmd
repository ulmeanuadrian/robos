@echo off
REM scripts/test-env/new.cmd — Windows cmd wrapper pentru new.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0new.ps1" %*
