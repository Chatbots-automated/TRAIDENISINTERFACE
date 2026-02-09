@echo off
REM TRAIDENIS Migration Script - No Docker Version
REM This runs the PowerShell migration script for native PostgreSQL

echo Running TRAIDENIS migration (No Docker)...
echo.

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0migrate-no-docker.ps1"

echo.
pause
