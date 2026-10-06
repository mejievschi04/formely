# Deployment script PowerShell pentru Backend (Laravel)
# Folosește: .\deploy-backend.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting backend deployment..." -ForegroundColor Cyan

# Navighează la directorul backend
Set-Location "$PSScriptRoot\volta-backend"

# Pull latest changes (dacă folosești git)
if (Test-Path ".git") {
    Write-Host "📥 Pulling latest changes..." -ForegroundColor Yellow
    git pull origin main
    if ($LASTEXITCODE -ne 0) {
        git pull origin master
    }
}

# Instalează dependențe PHP
Write-Host "📦 Installing PHP dependencies..." -ForegroundColor Yellow
composer install --no-dev --optimize-autoloader

# Instalează dependențe Node.js
Write-Host "📦 Installing Node.js dependencies..." -ForegroundColor Yellow
npm install

# Build assets
Write-Host "🔨 Building assets..." -ForegroundColor Yellow
npm run build

# Rulare migrații
Write-Host "🗄️  Running migrations..." -ForegroundColor Yellow
php artisan migrate --force

# Cache optimizări
Write-Host "⚡ Optimizing Laravel..." -ForegroundColor Yellow
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Clear old caches (opțional)
php artisan cache:clear

Write-Host "✅ Backend deployment completed successfully!" -ForegroundColor Green
