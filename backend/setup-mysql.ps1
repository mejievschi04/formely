# Script pentru configurare MySQL
# Acest script configureaza Laravel sa foloseasca MySQL in loc de SQLite

Write-Host "=== Configurare MySQL pentru VoltaAcademy ===" -ForegroundColor Cyan
Write-Host ""

# Verifica daca .env exista
if (-not (Test-Path ".env")) {
    Write-Host "Fisierul .env nu exista. Se creeaza din .env.example..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "[OK] Fisierul .env a fost creat." -ForegroundColor Green
    } else {
        Write-Host "[EROARE] .env.example nu exista!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Introdu datele pentru conexiunea MySQL:" -ForegroundColor Yellow
Write-Host ""

# Solicita datele de conexiune
$dbHost = Read-Host "Host MySQL (default: 127.0.0.1)"
if ([string]::IsNullOrWhiteSpace($dbHost)) {
    $dbHost = "127.0.0.1"
}

$dbPort = Read-Host "Port MySQL (default: 3306)"
if ([string]::IsNullOrWhiteSpace($dbPort)) {
    $dbPort = "3306"
}

$dbName = Read-Host "Nume baza de date MySQL"
if ([string]::IsNullOrWhiteSpace($dbName)) {
    Write-Host "[EROARE] Numele bazei de date este obligatoriu!" -ForegroundColor Red
    exit 1
}

$dbUser = Read-Host "Utilizator MySQL (default: root)"
if ([string]::IsNullOrWhiteSpace($dbUser)) {
    $dbUser = "root"
}

$dbPassword = Read-Host "Parola MySQL" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

Write-Host ""
Write-Host "Se actualizeaza fisierul .env..." -ForegroundColor Yellow

# Citeste .env
$envContent = Get-Content ".env" -Raw

# Actualizeaza sau adauga variabilele de baza de date
$envContent = $envContent -replace "DB_CONNECTION=.*", "DB_CONNECTION=mysql"
$envContent = $envContent -replace "DB_HOST=.*", "DB_HOST=$dbHost"
$envContent = $envContent -replace "DB_PORT=.*", "DB_PORT=$dbPort"
$envContent = $envContent -replace "DB_DATABASE=.*", "DB_DATABASE=$dbName"
$envContent = $envContent -replace "DB_USERNAME=.*", "DB_USERNAME=$dbUser"
$envContent = $envContent -replace "DB_PASSWORD=.*", "DB_PASSWORD=$dbPasswordPlain"

# Daca variabilele nu exista, le adauga
if ($envContent -notmatch "DB_CONNECTION=") {
    $envContent += "`nDB_CONNECTION=mysql`n"
}
if ($envContent -notmatch "DB_HOST=") {
    $envContent += "DB_HOST=$dbHost`n"
}
if ($envContent -notmatch "DB_PORT=") {
    $envContent += "DB_PORT=$dbPort`n"
}
if ($envContent -notmatch "DB_DATABASE=") {
    $envContent += "DB_DATABASE=$dbName`n"
}
if ($envContent -notmatch "DB_USERNAME=") {
    $envContent += "DB_USERNAME=$dbUser`n"
}
if ($envContent -notmatch "DB_PASSWORD=") {
    $envContent += "DB_PASSWORD=$dbPasswordPlain`n"
}

# Salveaza .env
Set-Content ".env" -Value $envContent -NoNewline

Write-Host "[OK] Fisierul .env a fost actualizat." -ForegroundColor Green
Write-Host ""

# Testeaza conexiunea
Write-Host "Se testeaza conexiunea la MySQL..." -ForegroundColor Yellow

try {
    # Foloseste mysql command line daca este disponibil
    $mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
    if ($mysqlPath) {
        # Creeaza baza de date daca nu exista
        $createDbQuery = "CREATE DATABASE IF NOT EXISTS `"$dbName`" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        
        # Ruleaza comanda MySQL
        $mysqlArgs = @(
            "-h", $dbHost,
            "-P", $dbPort,
            "-u", $dbUser,
            "-p$dbPasswordPlain",
            "-e", $createDbQuery
        )
        
        $result = & mysql $mysqlArgs 2>&1
        
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) {
            Write-Host "[OK] Baza de date '$dbName' a fost creata sau exista deja." -ForegroundColor Green
        } else {
            Write-Host "[AVERTISMENT] Nu s-a putut crea baza de date automat. Creeaza-o manual:" -ForegroundColor Yellow
            Write-Host "  CREATE DATABASE $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -ForegroundColor Cyan
        }
    } else {
        Write-Host "[AVERTISMENT] MySQL CLI nu este disponibil. Creeaza manual baza de date:" -ForegroundColor Yellow
        Write-Host "  CREATE DATABASE $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -ForegroundColor Cyan
    }
} catch {
    Write-Host "[AVERTISMENT] Nu s-a putut testa conexiunea automat." -ForegroundColor Yellow
    Write-Host "  Asigura-te ca MySQL este pornit si ca baza de date exista." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Urmatorii pasi ===" -ForegroundColor Cyan
Write-Host "1. Asigura-te ca MySQL este pornit" -ForegroundColor White
Write-Host "2. Creeaza baza de date daca nu exista:" -ForegroundColor White
Write-Host "   CREATE DATABASE $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -ForegroundColor Cyan
Write-Host "3. Ruleaza migrarile:" -ForegroundColor White
Write-Host "   php artisan migrate" -ForegroundColor Cyan
Write-Host "4. (Optional) Ruleaza seeders:" -ForegroundColor White
Write-Host "   php artisan db:seed" -ForegroundColor Cyan
Write-Host ""
Write-Host "[OK] Configurarea este completa!" -ForegroundColor Green
