@echo off
title ColdPilot Engine
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js from https://nodejs.org then run again & start https://nodejs.org/en/download & pause & exit /b)
if not exist ".deps-ok" (
  echo First-time setup - installing dependencies...
  if exist node_modules rmdir /s /q node_modules
  call npm install --no-audit --no-fund || (echo install failed - check internet & pause & exit /b)
  echo ok> .deps-ok
)
echo.
echo  ColdPilot ENGINE starting - this actually sends. Keep this window open.
echo  Dashboard: http://localhost:4400   (admin / coldpilot-7431)
echo.
start "" http://localhost:4400
node worker.js
pause
