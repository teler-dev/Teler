@echo off
REM TELER sync agent launcher for the Windows tracker machine.
REM
REM Fill in the two values below, then run this file.
REM   sync.bat            -> continuous watch mode (leave the window open)
REM   sync.bat --once     -> one catch-up pass, then exit
REM   sync.bat --once --dry-run  -> show what would upload, send nothing

setlocal

REM Your instance's sslip.io URL, from the output of setup-server.sh
set TELER_API_BASE=https://CHANGE-ME.sslip.io

REM SYNC_TOKEN from /etc/teler/teler.env on the server
set TELER_SYNC_TOKEN=CHANGE-ME

REM Local tracker data folder
set TELER_DATA_ROOT=C:\Users\essaz\OneDrive\Documents\AI-Timer\data

REM Seconds between rescans in watch mode
set TELER_SYNC_INTERVAL=60

if "%TELER_SYNC_TOKEN%"=="CHANGE-ME" (
  echo.
  echo   Edit sync.bat and set TELER_API_BASE and TELER_SYNC_TOKEN first.
  echo.
  pause
  exit /b 1
)

if "%~1"=="" (
  node "%~dp0sync-agent.js" --watch
) else (
  node "%~dp0sync-agent.js" %*
)

endlocal
pause
