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

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" -m launcher.system_check

echo.
pause
endlocal