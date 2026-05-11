@echo off
REM setup-python.cmd — Windows installer for robOS tier dependencies.
REM
REM Tier mapping:
REM   content-creator  -> Python 3.11+, ffmpeg, pandoc, Playwright Chromium, uv, yt-dlp
REM   video-producer   -> + HandBrake CLI, Node 22+, npx hyperframes
REM   social-publisher -> no Python deps
REM   researcher       -> uv (pentru tool-linkedin-scraper, research-trending)
REM
REM Usage:
REM   scripts\setup-python.cmd                    (auto-detect, install content-creator)
REM   scripts\setup-python.cmd --tier=video       (install Video Producer deps)
REM   scripts\setup-python.cmd --check            (check only, no install)
REM
REM Uses winget where possible. Falls back to pip / curl for non-winget tools.

setlocal enabledelayedexpansion

set "TIER=content-creator"
set "CHECK_ONLY=0"

:parse_args
if "%~1"=="" goto :start
set "ARG=%~1"
if "!ARG:~0,7!"=="--tier=" set "TIER=!ARG:~7!"
if "%~1"=="--check" set "CHECK_ONLY=1"
shift
goto :parse_args

:start
echo.
echo ===============================================================
echo   robOS Setup - Tier: %TIER%
echo ===============================================================
echo.

REM ─── Python 3.11+ ──────────────────────────────────────────────────
echo -- Core Python deps --
python --version >nul 2>&1
if !errorlevel! equ 0 (
  for /f "tokens=2" %%v in ('python --version 2^>^&1') do (
    set "PYV=%%v"
    for /f "tokens=1,2 delims=." %%a in ("%%v") do (
      if %%a equ 3 if %%b geq 11 (
        echo [OK] Python !PYV!
        goto :check_uv
      )
    )
  )
  echo [FAIL] Python prea vechi - necesita 3.11+
) else (
  echo [FAIL] Python missing
)

if "!CHECK_ONLY!"=="1" goto :skip_python_install
echo Install Python 3.11+ via winget...
winget install -e --id Python.Python.3.11 --silent
if !errorlevel! equ 0 (
  echo [OK] Python installed
) else (
  echo [WARN] winget install esuat. Install manual din https://python.org
)
:skip_python_install

:check_uv
where uv >nul 2>&1
if !errorlevel! equ 0 (
  echo [OK] uv installed
) else (
  echo [FAIL] uv missing
  if "!CHECK_ONLY!"=="0" (
    echo Installing uv...
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 ^| iex"
  )
)

REM ─── content-creator / video-producer / researcher deps ────────────
if "%TIER%"=="content-creator" goto :content_deps
if "%TIER%"=="video-producer" goto :content_deps
if "%TIER%"=="researcher" goto :content_deps
goto :skip_content_deps

:content_deps
echo.
echo -- Content/Video tools --
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 (
  echo [OK] ffmpeg
) else (
  echo [FAIL] ffmpeg missing
  if "!CHECK_ONLY!"=="0" (
    echo Installing ffmpeg via winget...
    winget install -e --id Gyan.FFmpeg --silent
  )
)

where pandoc >nul 2>&1
if !errorlevel! equ 0 (
  echo [OK] pandoc
) else (
  echo [WARN] pandoc missing (optional)
  if "!CHECK_ONLY!"=="0" (
    echo Installing pandoc via winget...
    winget install -e --id JohnMacFarlane.Pandoc --silent
  )
)

where yt-dlp >nul 2>&1
if !errorlevel! equ 0 (
  echo [OK] yt-dlp
) else (
  echo [FAIL] yt-dlp missing
  if "!CHECK_ONLY!"=="0" (
    echo Installing yt-dlp via pip...
    pip install --user yt-dlp
  )
)
:skip_content_deps

REM ─── video-producer extras ─────────────────────────────────────────
if "%TIER%"=="video-producer" (
  echo.
  echo -- Video Producer extras --
  where HandBrakeCLI >nul 2>&1
  if !errorlevel! equ 0 (
    echo [OK] HandBrake CLI
  ) else (
    echo [WARN] HandBrake CLI missing
    if "!CHECK_ONLY!"=="0" (
      echo Installing HandBrake CLI via winget...
      winget install -e --id HandBrake.HandBrake.CLI --silent
    )
  )

  where node >nul 2>&1
  if !errorlevel! equ 0 (
    for /f "tokens=*" %%n in ('node --version') do (
      set "NV=%%n"
      set "NV=!NV:v=!"
      for /f "tokens=1 delims=." %%a in ("!NV!") do (
        if %%a geq 22 (
          echo [OK] Node.js %%n
        ) else (
          echo [FAIL] Node.js %%n - necesita 22+
        )
      )
    )
  ) else (
    echo [FAIL] Node.js missing - install din https://nodejs.org
  )
)

echo.
echo -- Per-skill setup scripts --
echo Skill-urile cu setup propriu vor rula la prima invocare:
echo   tool-transcription/scripts/setup.sh   - WhisperX (~1.5GB)
echo   tool-web-screenshot/scripts/setup.sh  - Playwright Chromium (~150MB)
echo   tool-video-screenshots/scripts/setup.sh - yt-dlp + ffmpeg deps
echo   viz-excalidraw-diagram/scripts/setup.sh - Playwright Chromium

echo.
echo ===============================================================
echo [OK] Setup complete pentru tier '%TIER%'
echo ===============================================================
echo.
echo Next steps:
echo   1. Adauga API keys in .env pentru tier-ul ales
echo   2. Ruleaza un skill (ex: 'transcribe video.mp4' pentru tool-transcription)
echo   3. Prima rulare per skill descarca modelele necesare (one-time)
echo.

endlocal
