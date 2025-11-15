@echo off
echo Starting Hedgehog Technologies Backend Server...
echo.
cd /d "%~dp0"
call npx ts-node src/index.ts
pause

