@echo off
echo Starting Sprint Relay Debugger (dev mode)...
echo.
cd /d "%~dp0"

echo Cleaning up any existing processes...
REM Kill any process using port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process %%a on port 3000...
    taskkill /F /PID %%a >nul 2>&1
)

REM Remove Next.js cache to prevent hydration issues
if exist ".next" (
    echo Clearing Next.js cache...
    rmdir /s /q ".next" >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo Starting Next.js dev server...
start "Sprint Relay Dev Server" cmd /k "npm run dev"

echo Waiting for dev server to boot...
timeout /t 10 /nobreak >nul

echo Opening browser...
start "" http://localhost:3000

echo.
echo Dev server should be running now.
echo You can close this window.
pause
