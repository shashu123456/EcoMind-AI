@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title EcoMind AI Launcher

echo.
echo   ============================================================
echo    EcoMind AI - One-click Launcher
echo   ============================================================
echo.

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" -m launcher.start
endlocal