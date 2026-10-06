# Deployment script PowerShell pentru Frontend (React + Vite)
# Folosește: .\deploy-frontend.ps1

$ErrorActionPreference = "Stop"

# Navighează la directorul frontend
Set-Location "$PSScriptRoot\volta-frontend"

Write-Host "🚀 Starting frontend deployment..." -ForegroundColor Cyan

# Pull latest changes (dacă folosești git)
if (Test-Path ".git") {
    Write-Host "📥 Pulling latest changes..." -ForegroundColor Yellow
    git pull origin main
    if ($LASTEXITCODE -ne 0) {
        git pull origin master
    }
}

# Instalează dependențe
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Build pentru producție
Write-Host "🔨 Building for production..." -ForegroundColor Yellow
npm run build

Write-Host "✅ Frontend deployment completed successfully!" -ForegroundColor Green
Write-Host "📁 Build files are in the 'dist' directory" -ForegroundColor Cyan
