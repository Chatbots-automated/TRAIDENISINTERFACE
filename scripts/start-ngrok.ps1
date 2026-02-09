# PowerShell script to start ngrok tunnel for PostgREST
# Run as: .\start-ngrok.ps1

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Starting ngrok tunnel for PostgREST" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if PostgREST is running
Write-Host "Checking if PostgREST is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ PostgREST is running on localhost:3000" -ForegroundColor Green
} catch {
    Write-Host "✗ ERROR: PostgREST is not running on localhost:3000" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker services first:" -ForegroundColor Yellow
    Write-Host "  wsl -e bash -c 'cd /home/user/TRAIDENISINTERFACE && docker-compose -f docker-compose.postgrest.yml up -d'" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Starting ngrok tunnel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT INSTRUCTIONS:" -ForegroundColor Cyan
Write-Host "1. Copy the HTTPS Forwarding URL from ngrok output below" -ForegroundColor White
Write-Host "2. Go to Netlify Dashboard → Site Settings → Environment Variables" -ForegroundColor White
Write-Host "3. Add/Update:" -ForegroundColor White
Write-Host "   VITE_POSTGREST_URL = https://YOUR-NGROK-URL.ngrok-free.app" -ForegroundColor Green
Write-Host "   VITE_POSTGREST_ANON_KEY = anon" -ForegroundColor Green
Write-Host "4. Trigger a new deploy in Netlify" -ForegroundColor White
Write-Host ""
Write-Host "ngrok dashboard: http://localhost:4040" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if ngrok is installed
if (Get-Command ngrok -ErrorAction SilentlyContinue) {
    ngrok http 3000
} elseif (Test-Path "C:\ngrok\ngrok.exe") {
    & "C:\ngrok\ngrok.exe" http 3000
} else {
    Write-Host "✗ ERROR: ngrok not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install ngrok:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://ngrok.com/download" -ForegroundColor White
    Write-Host "2. Extract to C:\ngrok\" -ForegroundColor White
    Write-Host "3. Run: ngrok config add-authtoken YOUR_TOKEN" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
