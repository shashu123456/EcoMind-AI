@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

rem ===========================================================================
rem  EcoMind AI - the one entry point (Windows).
rem
rem    ecomind.bat            start the app (installs anything missing)
rem    ecomind.bat stop       stop every service
rem    ecomind.bat check      report on the machine without changing it
rem    ecomind.bat help       this list
rem
rem  Why one file and not Launch_EcoMind / Stop_EcoMind / Check_System: all
rem  three carried a byte-identical copy of the interpreter search below, and
rem  a fourth copy of it was needed in each time the search changed. One
rem  dispatcher, one search.
rem ===========================================================================

set "COMMAND=start"
if not "%~1"=="" set "COMMAND=%~1"

if /i "%COMMAND%"=="help" goto :usage
if /i "%COMMAND%"=="-h" goto :usage
if /i "%COMMAND%"=="--help" goto :usage

if /i not "%COMMAND%"=="start" if /i not "%COMMAND%"=="stop" if /i not "%COMMAND%"=="check" if /i not "%COMMAND%"=="verify" (
  echo   [!] Unknown command '%COMMAND%'.
  echo.
  goto :usage
)

title EcoMind AI - %COMMAND%

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
rem    Each candidate must REPORT 3.10+, not merely run: `py -3` on this
rem    machine silently resolves to a 3.7 install, which then builds a venv
rem    that cannot install fastapi. Candidates without a version suffix are
rem    still gated by the same check.
if not defined PY (
  for %%C in ("python" "python3" "py -3.13" "py -3.12" "py -3.11" "py -3.10" "py -3") do (
    if not defined PY (
      %%~C -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
      if !ERRORLEVEL! equ 0 set "PY=%%~C"
    )
  )
)

rem 3. No interpreter at all. This is the one prerequisite the Python launcher
rem    cannot satisfy for itself -- `python -m launcher.start` is exactly what
rem    is missing -- so it is installed from here, which is the one place
rem    guaranteed to run. Afterwards the search repeats, because an installer
rem    can exit 0 and still leave nothing runnable: that is the Microsoft Store
rem    alias case this tree already fell into once.
if not defined PY (
  echo.
  echo   [!] No Python interpreter found on this machine.
  echo       Installing one now, so this stays a one-click setup ...
  echo.
  set "INSTALLED=0"
  where winget >nul 2>&1
  if !ERRORLEVEL! equ 0 (
    winget install -e --id Python.Python.312 --accept-source-agreements --accept-package-agreements --scope user --silent
    set "INSTALLED=1"
  ) else (
    where choco >nul 2>&1
    if !ERRORLEVEL! equ 0 (
      choco install python3 -y
      set "INSTALLED=1"
    )
  )

  if "!INSTALLED!"=="1" (
    rem A fresh install is not on this console's PATH yet.
    if exist "%LOCALAPPDATA%\Programs\Python" (
      for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do set "PATH=%%D;!PATH!"
    )
    for /d %%D in ("C:\Program Files\Python*") do set "PATH=%%D;!PATH!"

    set "PY="
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    if not defined PY for %%C in ("python" "py -3.12" "py -3.11" "py -3.10" "py -3") do (
      if not defined PY (
        %%~C -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
        if !ERRORLEVEL! equ 0 set "PY=%%~C"
      )
    )
  )
)

rem 4. Still nothing. Say why, and stop -- do not open a browser onto a blank
rem    page or leave the user guessing.
if not defined PY (
  echo.
  echo   [!] Python 3.10+ is required but no working interpreter was found.
  echo.
  echo       The automatic install did not produce a runnable interpreter.
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

if /i "%COMMAND%"=="start" (
  echo.
  echo   ============================================================
  echo    EcoMind AI - One-click Launcher
  echo    ^(installs everything required on first run^)
  echo   ============================================================
  echo.
  %PY% -m launcher.start %2 %3 %4 %5 %6 %7 %8 %9
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
)

if /i "%COMMAND%"=="check" (
  %PY% -m launcher.start --check %2 %3 %4 %5 %6 %7 %8 %9
  echo.
  pause
  endlocal & exit /b 0
)

rem verify: install everything, prove it worked, then exit. Used by CI.
if /i "%COMMAND%"=="verify" (
  %PY% -m launcher.start --verify %2 %3 %4 %5 %6 %7 %8 %9
  set "RC=%ERRORLEVEL%"
  endlocal & exit /b %RC%
)

rem stop
%PY% -m launcher.stop %2 %3 %4 %5 %6 %7 %8 %9
echo.
pause
endlocal & exit /b 0

:usage
echo   ============================================
echo    EcoMind AI
echo   ============================================
echo.
echo    ecomind.bat            start the app ^(installs anything missing^)
echo    ecomind.bat stop       stop every service
echo    ecomind.bat check      report on the machine without changing it
echo    ecomind.bat verify     install everything, prove it worked, exit
echo    ecomind.bat help       this list
echo.
pause
endlocal & exit /b 0
