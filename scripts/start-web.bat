@echo off
setlocal
title Hmanager Pro - Web Dashboard Launcher
echo ====================================================
echo   Starting Hmanager Pro Web Dashboard...
echo ====================================================

pushd "%~dp0.."

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Error: Node.js is not found in your system PATH.
  echo Please install Node.js from https://nodejs.org/
  popd
  pause
  exit /b 1
)

echo Starting Web Dashboard at http://localhost:3000 ...
start "" http://localhost:3000
node server.js
popd
pause
