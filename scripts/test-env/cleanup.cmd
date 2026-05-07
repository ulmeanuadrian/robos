@echo off
REM scripts/test-env/cleanup.cmd — Windows cmd wrapper pentru cleanup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup.ps1" %*
