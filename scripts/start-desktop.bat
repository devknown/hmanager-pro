@echo off
setlocal
title Hmanager Pro - Standalone Desktop Launcher
echo ====================================================
echo   Starting Hmanager Pro Desktop Application...
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

echo Starting backend proxy...
start /b node server.js

timeout /t 2 /nobreak >nul

echo Opening Hmanager Pro standalone window (820x560)...
start msedge --app="http://localhost:3000" --window-size=820,560

echo.
echo Application running! Close this window to stop the application.
popd
pause >nul
