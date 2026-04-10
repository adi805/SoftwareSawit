@echo off
chcp 65001 >nul
REM GitHub Actions Monitor - Status Script
REM Shows current monitor status

set "MONITOR_DIR=%~dp0"
set "STATE_DIR=%MONITOR_DIR%state"
set "LOG_DIR=%MONITOR_DIR%logs"

echo ==========================================
echo   GitHub Actions Auto-Monitor - Status
echo ==========================================
echo.

REM Check if PID file exists
if not exist "%STATE_DIR%\monitor.pid" (
    echo Status: STOPPED
    echo.
    echo [INFO] Monitor is not running.
    echo [INFO] To start: start-monitor.bat
    goto :show_logs
)

set /p PID=<"%STATE_DIR%\monitor.pid"

REM Check if process is running
tasklist /FI "PID eq %PID%" 2>nul | findstr "%PID%" >nul
if errorlevel 1 (
    echo Status: STOPPED (stale PID file)
    echo.
    echo [WARNING] PID file exists but process %PID% is not running.
    echo [INFO] Cleaning up stale PID file...
    del "%STATE_DIR%\monitor.pid" 2>nul
    echo [INFO] To start: start-monitor.bat
) else (
    echo Status: RUNNING
    echo PID: %PID%
    echo.
    
    REM Show process info
    echo Process Info:
    tasklist /FI "PID eq %PID%" /FO TABLE 2>nul | findstr /V "====="
    echo.
    
    REM Show uptime if possible
    for /f "tokens=2 delims=," %%a in ('wmic process where "ProcessId=%PID%" get CreationDate /format:csv 2^>nul ^| findstr "%PID%"') do (
        set "START_TIME=%%~a"
    )
    if defined START_TIME (
        echo Started: %START_TIME%
    )
)

echo.

:show_logs
REM Show state info if available
if exist "%STATE_DIR%\monitor-state.json" (
    echo Monitor State:
    echo ---------------
    type "%STATE_DIR%\monitor-state.json" 2>nul | findstr /V "^{" | findstr /V "^}"
    echo.
)

REM Show last log entries
if exist "%LOG_DIR%\auto-monitor.log" (
    echo Recent Log Entries (last 10 lines):
    echo -----------------------------------
    tail -n 10 "%LOG_DIR%\auto-monitor.log" 2>nul || (
        powershell -Command "Get-Content '%LOG_DIR%\auto-monitor.log' -Tail 10" 2>nul
    )
    echo.
    echo Full log: %LOG_DIR%\auto-monitor.log
)

echo.
echo Commands:
echo   - Start:  start-monitor.bat
echo   - Stop:   stop-monitor.bat
echo   - Logs:   type "%LOG_DIR%\auto-monitor.log"
echo.
pause
