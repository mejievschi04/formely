# Script pentru instalarea Composer pe Windows
Write-Host "Instalare Composer..." -ForegroundColor Green

# Verifică dacă PHP este instalat
$phpVersion = php -v 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "EROARE: PHP nu este instalat sau nu este în PATH!" -ForegroundColor Red
    Write-Host "Instalează PHP mai întâi. Vezi INSTALL_PHP.md" -ForegroundColor Yellow
    exit 1
}

Write-Host "PHP este instalat:" -ForegroundColor Green
php -v

# Descarcă Composer installer
Write-Host "`nDescărcare Composer installer..." -ForegroundColor Yellow
$composerInstaller = "$env:TEMP\composer-setup.php"

try {
    Invoke-WebRequest -Uri "https://getcomposer.org/installer" -OutFile $composerInstaller -UseBasicParsing
    Write-Host "Installer descărcat cu succes!" -ForegroundColor Green
} catch {
    Write-Host "EROARE la descărcare: $_" -ForegroundColor Red
    exit 1
}

# Rulează installer-ul
Write-Host "`nInstalare Composer..." -ForegroundColor Yellow
php $composerInstaller

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nComposer instalat cu succes!" -ForegroundColor Green
    
    # Mută composer.phar în directorul curent sau într-un loc accesibil
    if (Test-Path "composer.phar") {
        Write-Host "`nComposer.phar a fost creat în directorul curent." -ForegroundColor Cyan
        Write-Host "Pentru a folosi Composer global, mută composer.phar în PATH sau folosește:" -ForegroundColor Yellow
        Write-Host "  php composer.phar install" -ForegroundColor Cyan
    }
} else {
    Write-Host "EROARE la instalare!" -ForegroundColor Red
    exit 1
}

# Curăță installer-ul
Remove-Item $composerInstaller -ErrorAction SilentlyContinue

Write-Host "`n✅ Composer este gata de folosit!" -ForegroundColor Green
Write-Host "`nUrmătorii pași:" -ForegroundColor Cyan
Write-Host "1. Pentru instalare globală, mută composer.phar în PATH" -ForegroundColor Yellow
Write-Host "2. Sau folosește: php composer.phar install" -ForegroundColor Yellow

