@echo off
REM scripts/test-env/list.cmd — Windows cmd wrapper pentru list.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0list.ps1" %*
