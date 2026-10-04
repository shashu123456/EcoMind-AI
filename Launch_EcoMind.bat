@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title EcoMind AI Launcher

echo.
echo   ============================================================
echo    EcoMind AI - One-click Launcher
echo    (installs everything required on first run)
echo   ============================================================
echo.

rem ---------------------------------------------------------------------------
rem Find a Python that genuinely runs.
rem
rem `where py` succeeds whenever the py LAUNCHER is installed, even when no
rem Python is registered behind it -- so testing for its presence proved nothing
rem and the launcher then died with "Python was not found" from deep inside its
rem own bootstrap. The check below actually executes each candidate and requires
rem it to report a version, which is the same rule scripts/find_python.sh
rem applies on macOS, Linux and Git Bash.
rem ---------------------------------------------------------------------------
set "PY="

rem 1. An existing virtualenv always wins.
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import sys" >nul 2>&1
  if !ERRORLEVEL! equ 0 set "PY=%~dp0.venv\Scripts\python.exe"
)

rem 2. Otherwise a system interpreter, in order of preference.
if not defined PY (
  for %%C in ("py -3" "python" "python3") do (
    if not defined PY (
      %%~C -c "import sys" >nul 2>&1
      if !ERRORLEVEL! equ 0 set "PY=%%~C"
    )
  )
)

rem 3. Nothing usable. Say why, and stop -- do not open a browser onto a blank
rem    page or leave the user guessing.
if not defined PY (
  echo   [!] Python 3.10+ is required but no working interpreter was found.
  echo.
  echo       This usually means the Microsoft Store's "python" alias is
  echo       intercepting the command. Install Python from python.org and
  echo       tick "Add python.exe to PATH", then reopen this window.
  echo.
  echo       Opening the download page...
  start "" "https://www.python.org/downloads/"
  echo.
  pause
  exit /b 1
)

rem PYTHONUTF8=1 so the launcher's Unicode box drawing and rupee signs survive
rem a console using a legacy code page.
set "PYTHONUTF8=1"

%PY% -m launcher.start %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo   ------------------------------------------------------------
  echo    [!] EcoMind AI exited with an error ^(code %RC%^).
  echo    [!] A copy of this output is in logs\launcher.log
  echo    [!] Press any key to close this window...
  echo   ------------------------------------------------------------
  pause >nul
)
endlocal & exit /b %RC%