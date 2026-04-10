@echo off
chcp 65001 >nul
REM GitHub Actions Monitor - Start Script
REM Starts the monitor in the background

set "MONITOR_DIR=%~dp0"
set "LOG_DIR=%MONITOR_DIR%logs"
set "STATE_DIR=%MONITOR_DIR%state"

REM Create directories if they don't exist
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%STATE_DIR%" mkdir "%STATE_DIR%"

echo ==========================================
echo   GitHub Actions Auto-Monitor
echo ==========================================
echo.

REM Check if GITHUB_PAT is set
if "%GITHUB_PAT%"=="" (
    echo [INFO] GITHUB_PAT not set in environment.
    echo [INFO] Checking for token file...
    
    if exist "%~dp0..\..\..\Key Github.txt" (
        set /p GITHUB_PAT=<"%~dp0..\..\..\Key Github.txt"
        echo [SUCCESS] Token loaded from Key Github.txt
    ) else (
        echo [ERROR] GITHUB_PAT not found!
        echo [INFO] Please set GITHUB_PAT environment variable
        echo [INFO] Or create Key Github.txt in repository root
        pause
        exit /b 1
    )
)

echo.

REM Check if already running
if exist "%STATE_DIR%\monitor.pid" (
    set /p PID=<"%STATE_DIR%\monitor.pid"
    tasklist /FI "PID eq %PID%" 2>nul | findstr "%PID%" >nul
    if !errorlevel! == 0 (
        echo [WARNING] Monitor is already running (PID: %PID%)
        echo Use status.bat to check status or stop-monitor.bat to stop it.
        exit /b 1
    )
)

echo [INFO] Starting monitor in background...
echo [INFO] Log file: %LOG_DIR%\auto-monitor.log
echo.

REM Start Node.js in the background using start command
start /B "GitHub Actions Monitor" node "%MONITOR_DIR%auto-monitor.js" > "%LOG_DIR%\monitor-console.log" 2>&1

REM Wait a moment for the process to start and write PID
timeout /t 2 /nobreak >nul

REM Get the PID from the file
if exist "%STATE_DIR%\monitor.pid" (
    set /p PID=<"%STATE_DIR%\monitor.pid"
    echo [SUCCESS] Monitor started successfully!
    echo [INFO] PID: %PID%
    echo [INFO] Log: %LOG_DIR%\auto-monitor.log
    echo.
    echo Commands:
    echo   - Check status:  status.bat
    echo   - View logs:     type "%LOG_DIR%\auto-monitor.log"
    echo   - Stop monitor:  stop-monitor.bat
) else (
    echo [WARNING] Monitor started but PID file not found.
    echo [INFO] Check logs: %LOG_DIR%\auto-monitor.log
)

echo.
pause
