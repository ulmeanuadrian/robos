@echo off
REM Thin wrapper — delega la cross-platform status-crons.js
node "%~dp0status-crons.js" %*
