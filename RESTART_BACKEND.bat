@echo off
echo ========================================
echo   Restarting Hogtech Backend Server
echo ========================================
echo.
cd /d "%~dp0"
echo Killing any existing Node processes on port 5000...
npx kill-port 5000 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Starting backend server...
echo.
npm run dev




