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
