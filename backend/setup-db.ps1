# Script PowerShell pentru setup-ul bazei de date
Write-Host "Setting up database..." -ForegroundColor Green

# Navigate to backend directory
Set-Location $PSScriptRoot

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "Creating .env file from .env.example..." -ForegroundColor Yellow
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
    } else {
        Write-Host "Creating basic .env file..." -ForegroundColor Yellow
        @"
APP_NAME=VoltaAcademy
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite
"@ | Out-File -FilePath .env -Encoding utf8
    }
}

# Generate app key if not set
Write-Host "Generating application key..." -ForegroundColor Yellow
php artisan key:generate

# Create database file if it doesn't exist
$dbPath = "database/database.sqlite"
if (-not (Test-Path $dbPath)) {
    Write-Host "Creating database file..." -ForegroundColor Yellow
    New-Item -ItemType File -Path $dbPath -Force | Out-Null
}

# Run migrations
Write-Host "Running migrations..." -ForegroundColor Yellow
php artisan migrate --force

# Run seeders
Write-Host "Seeding database..." -ForegroundColor Yellow
php artisan db:seed --force

Write-Host "Database setup complete!" -ForegroundColor Green
Write-Host "You can now start the backend server with: php artisan serve" -ForegroundColor Cyan

