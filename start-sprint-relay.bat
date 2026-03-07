@echo off
echo Starting Sprint Relay Debugger...
echo.
cd /d "%~dp0"
echo Building latest version...
call npm run build
echo Opening browser...
start http://localhost:3000
npm run start
pause
