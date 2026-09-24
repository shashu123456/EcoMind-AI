@echo off
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title EcoMind AI - Stop

echo.
echo   ============================================
echo    EcoMind AI - Stop all services
echo   ============================================
echo.

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" -m launcher.stop

echo.
pause
endlocal