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

set "PY="
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
if not defined PY ( where py >nul 2>&1 && set "PY=py -3" )
if not defined PY ( where python >nul 2>&1 && set "PY=python" )

if not defined PY (
  echo   [!] Python 3.11+ is required but was not found on PATH.
  echo   [!] Opening the Python download page...
  start "" "https://www.python.org/downloads/"
  echo.
  echo   [!] Install Python (tick "Add python.exe to PATH"), then re-run this file.
  echo.
  pause
  exit /b 1
)

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
