@echo off
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title EcoMind AI - System Check

echo.
echo   ============================================
echo    EcoMind AI - System Health Check
echo   ============================================
echo.

set "PY="
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
if not defined PY ( where py >nul 2>&1 && set "PY=py -3" )
if not defined PY ( where python >nul 2>&1 && set "PY=python" )
if not defined PY (
  echo   [!] Python was not found on PATH.
  pause
  exit /b 1
)

%PY% -m launcher.start --check

echo.
pause
endlocal
