@echo off
echo Checking for processes on port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Killing process %%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Port 5000 is now free.

