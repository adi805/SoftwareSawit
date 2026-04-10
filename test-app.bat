@echo off
title SoftwareSawit Test Mode
cd /d "%~dp0"
echo Starting SoftwareSawit with remote debugging on port 9222...
electron . --remote-debugging-port=9222
