@echo off
REM Start ngrok tunnel for PostgREST
REM Make sure Docker is running first!

echo ================================================
echo Starting ngrok tunnel for PostgREST
echo ================================================
echo.

REM Check if PostgREST is running
curl -s http://localhost:3000/ >nul 2>&1
if errorlevel 1 (
    echo ERROR: PostgREST is not running on localhost:3000
    echo Please start Docker services first:
    echo   docker-compose -f docker-compose.postgrest.yml up -d
    echo.
    pause
    exit /b 1
)

echo PostgREST is running on localhost:3000
echo.
echo Starting ngrok tunnel...
echo.
echo IMPORTANT: Copy the HTTPS URL and add it to Netlify environment variables:
echo   VITE_POSTGREST_URL=https://YOUR-NGROK-URL.ngrok-free.app
echo.

ngrok http 3000
