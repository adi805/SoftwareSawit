@echo off
title SoftwareSawit - User Management
cd /d "%~dp0"

REM Set log file in project directory
set LOG_FILE=%~dp0user-mgmt-debug.log

REM Check if user wants to clear the log
if "%1"=="clear" goto clear_log
if "%1"=="reset" goto clear_log

:start
REM Add timestamp to log
echo === User Management Log - %date% %time% === >> %LOG_FILE%

REM Start MCP Server in background
echo Starting MCP Server on port 3456...
start /B node mcp-server.js > nul 2>&1

REM Build the app
echo Building app...
call npm run build

REM Start Electron with logging
echo Starting User Management app...
npx electron . --user-mgmt >> %LOG_FILE% 2>&1

echo.
echo Log file: %LOG_FILE%
echo.
type %LOG_FILE%
goto end

:clear_log
echo Clearing log file...
del %LOG_FILE% 2>nul
echo Log file cleared.
echo.
goto :eof

:end
pause



