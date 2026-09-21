# Script migrare manuală pe VPS - Formely
# Copiază toate fișierele modificate pe VPS
#
# Folosire:
#   1. Sincronizare cu rsync (dacă ai SSH):
#      .\scripts\migrate-vps-manual.ps1 -VpsUser "root" -VpsHost "IP_SAU_DOMENIU"
#
#   2. Creare arhivă pentru transfer manual:
#      .\scripts\migrate-vps-manual.ps1 -CreateZip
#
#   3. Doar listare fișiere:
#      .\scripts\migrate-vps-manual.ps1 -ListOnly

param(
    [string]$VpsUser = "",
    [string]$VpsHost = "",
    [switch]$CreateZip = $false,
    [switch]$ListOnly = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Fișiere modificate (din git status + noi)
$Files = @(
    # Backend
    "backend/app/Http/Controllers/Api/Admin/UserAdminController.php",
    "backend/app/Http/Controllers/Api/AuthController.php",
    "backend/app/Http/Controllers/Api/StudentDashboardController.php",
    "backend/routes/api.php",
    "backend/database/migrations/2026_02_05_000001_add_pending_status_to_users_table.php",
    # Frontend
    "frontend/index.html",
    "frontend/src/App.jsx",
    "frontend/src/components/SplashScreen.css",
    "frontend/src/components/SplashScreen.jsx",
    "frontend/src/components/student/StudentTopNavNotifications.jsx",
    "frontend/src/contexts/AuthContext.jsx",
    "frontend/src/contexts/ToastContext.jsx",
    "frontend/src/pages/CoursesPage.css",
    "frontend/src/pages/EventsPage.jsx",
    "frontend/src/pages/LessonsPage.css",
    "frontend/src/pages/LessonsPage.jsx",
    "frontend/src/pages/LoginPage.jsx",
    "frontend/src/pages/RegisterPage.jsx",
    "frontend/src/pages/admin/AdminUsersPage.jsx",
    "frontend/src/services/api.js",
    "frontend/src/styles/admin-navigation-modern.css",
    "frontend/src/styles/admin-users-modern.css",
    "frontend/src/styles/auth-modern.css",
    "frontend/src/styles/dark-theme-wcag.css",
    "frontend/src/styles/design-system.css",
    "frontend/src/styles/light-theme-wcag.css",
    "frontend/src/styles/mobile-optimizations.css",
    "frontend/src/styles/student-navigation-modern.css",
    "frontend/src/styles/toast-system.css"
)

# Directorul de destinație pe VPS (ajustează după setup)
$VpsPath = "/var/www/app/formely"

Write-Host "`nFormely - Migrare manuala pe VPS`n" -ForegroundColor Cyan

if ($ListOnly) {
    Write-Host "Fisiere de migrat:" -ForegroundColor Yellow
    foreach ($f in $Files) {
        $p = Join-Path $ProjectRoot $f
        if (Test-Path $p) { Write-Host "  [OK] $f" } else { Write-Host "  [--] $f (lipseste)" -ForegroundColor Red }
    }
    Write-Host "`nTotal: $($Files.Count) fisiere`n"
    exit 0
}

if ($CreateZip) {
    $ZipPath = Join-Path $ProjectRoot "formely-migrate-$(Get-Date -Format 'yyyyMMdd-HHmm').zip"
    $TempDir = Join-Path $env:TEMP "formely-migrate-$$"
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
    
    foreach ($f in $Files) {
        $src = Join-Path $ProjectRoot $f
        if (Test-Path $src) {
            $dest = Join-Path $TempDir $f
            $destDir = Split-Path $dest -Parent
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            Copy-Item $src $dest -Force
        }
    }
    
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -Force
    Remove-Item $TempDir -Recurse -Force
    
    Write-Host "[OK] Arhiva creata: $ZipPath" -ForegroundColor Green
    Write-Host "`nPasi pe VPS:" -ForegroundColor Yellow
    Write-Host "  1. Copiaza arhiva pe VPS: scp `"$ZipPath`" user@VPS:$VpsPath/"
    Write-Host "  2. Pe VPS: cd $VpsPath; unzip -o formely-migrate-*.zip"
    Write-Host "  3. Rebuild: docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache"
    Write-Host "  4. Restart: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    Write-Host "  5. Migrari: docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend php artisan migrate --force`n"
    exit 0
}

if ($VpsUser -and $VpsHost) {
    Write-Host "Sincronizare cu rsync către ${VpsUser}@${VpsHost}..." -ForegroundColor Yellow
    
    # Verifică rsync (Windows: WSL sau Git Bash)
    $rsync = Get-Command rsync -ErrorAction SilentlyContinue
    if (-not $rsync) {
        Write-Host "[X] rsync nu e gasit. Foloseste -CreateZip pentru arhiva." -ForegroundColor Red
        Write-Host "   Sau instalează rsync (Git for Windows include rsync)." -ForegroundColor Gray
        exit 1
    }
    
    foreach ($f in $Files) {
        $src = Join-Path $ProjectRoot $f
        if (Test-Path $src) {
            $dest = "${VpsUser}@${VpsHost}:${VpsPath}/$f"
            Write-Host "  -> $f"
            & rsync -avz "$src" "$dest" 2>&1
        }
    }
    
    Write-Host "`n[OK] Sincronizare finalizata!" -ForegroundColor Green
    Write-Host "`nPe VPS rulează:" -ForegroundColor Yellow
    Write-Host "  cd $VpsPath"
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache"
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend php artisan migrate --force`n"
    exit 0
}

# Help
Write-Host "Opțiuni:" -ForegroundColor Yellow
Write-Host "  -ListOnly          Listare fișiere de migrat"
Write-Host "  -CreateZip         Creare arhivă ZIP pentru transfer manual"
Write-Host "  -VpsUser USER      User SSH pentru rsync"
Write-Host "  -VpsHost HOST      IP sau domeniu VPS"
Write-Host "`nExemple:"
Write-Host "  .\scripts\migrate-vps-manual.ps1 -ListOnly"
Write-Host "  .\scripts\migrate-vps-manual.ps1 -CreateZip"
Write-Host "  .\scripts\migrate-vps-manual.ps1 -VpsUser root -VpsHost localhost`n"
