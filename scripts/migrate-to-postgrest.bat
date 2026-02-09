@echo off
REM TRAIDENIS Migration Script - Windows Batch Wrapper
REM This runs the PowerShell migration script

echo Running TRAIDENIS migration...
echo.

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0migrate-to-postgrest.ps1"

echo.
pause
