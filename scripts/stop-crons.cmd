@echo off
REM Thin wrapper — delega la cross-platform stop-crons.js
node "%~dp0stop-crons.js" %*
