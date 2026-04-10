@echo off
cd /d "%~dp0"
npx electron . --user-mgmt > app.log 2>&1
