@echo off
setlocal
cd /d "%~dp0"
set PORT=%1
if "%PORT%"=="" set PORT=5291

where node >nul 2>nul
if errorlevel 1 (
  echo [RuleStudio] Node.js not found in PATH.
  pause
  exit /b 1
)

echo [RuleStudio] http://127.0.0.1:%PORT%/
start "" "http://127.0.0.1:%PORT%/"
node --watch server.mjs %PORT%
if errorlevel 1 pause
endlocal
