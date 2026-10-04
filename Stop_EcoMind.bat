@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

title EcoMind AI - Stop

echo.
echo   ===========================================
echo    EcoMind AI - Stop all services
echo   ===========================================
echo.

rem Same validation as Launch_EcoMind.bat: `where py` proves only that the
rem launcher exists, not that a Python is installed behind it.
set "PY="
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import sys" >nul 2>&1
  if !ERRORLEVEL! equ 0 set "PY=%~dp0.venv\Scripts\python.exe"
)
if not defined PY (
  for %%C in ("py -3" "python" "python3") do (
    if not defined PY (
      %%~C -c "import sys" >nul 2>&1
      if !ERRORLEVEL! equ 0 set "PY=%%~C"
    )
  )
)

if not defined PY (
  echo   [!] Python was not found, so the launcher cannot be stopped.
  echo   [!] Close any EcoMind window instead, or end python.exe and node.exe
  echo   [!] from Task Manager.
  echo.
  pause
  exit /b 1
)

%PY% -m launcher.stop %*

echo.
pause
endlocal