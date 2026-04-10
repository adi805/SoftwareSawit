@echo off
chcp 65001 >nul
REM GitHub Actions Monitor - Stop Script
REM Stops the running monitor

set "MONITOR_DIR=%~dp0"
set "STATE_DIR=%MONITOR_DIR%state"

echo ==========================================
echo   GitHub Actions Auto-Monitor - Stop
echo ==========================================
echo.

REM Check if PID file exists
if not exist "%STATE_DIR%\monitor.pid" (
    echo [WARNING] No PID file found. Monitor may not be running.
    echo [INFO] Checking for any node processes running auto-monitor.js...
    
    tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul | findstr "auto-monitor" >nul
    if !errorlevel! == 0 (
        echo [INFO] Found node process. Attempting to kill...
        for /f "tokens=2 delims=," %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr "auto-monitor"') do (
            set "PID=%%~a"
            taskkill /PID !PID! /F 2>nul
            if !errorlevel! == 0 (
                echo [SUCCESS] Killed process with PID: !PID!
            ) else (
                echo [ERROR] Failed to kill process !PID!
            )
        )
    ) else (
        echo [INFO] No monitor process found.
    )
    goto :cleanup
)

REM Read PID from file
set /p PID=<"%STATE_DIR%\monitor.pid"
echo [INFO] Found monitor PID: %PID%

REM Check if process is still running
tasklist /FI "PID eq %PID%" 2>nul | findstr "%PID%" >nul
if errorlevel 1 (
    echo [WARNING] Process %PID% is not running.
    goto :cleanup
)

REM Try graceful shutdown first (SIGINT simulation)
echo [INFO] Sending shutdown signal...
REM On Windows, we can't easily send SIGINT, so we try taskkill /F first
REM If the monitor handles Ctrl+C, we could use a different approach

taskkill /PID %PID% /F >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to terminate process %PID%
    echo [INFO] You may need to kill it manually using Task Manager.
    exit /b 1
) else (
    echo [SUCCESS] Monitor stopped successfully (PID: %PID%)
)

:cleanup
REM Clean up PID file
if exist "%STATE_DIR%\monitor.pid" (
    del "%STATE_DIR%\monitor.pid" 2>nul
    echo [INFO] Cleaned up PID file.
)

echo.
echo Monitor has been stopped.
echo.
pause
