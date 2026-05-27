# Script pentru eliminarea secretului din commit 34d71b7
# Rulează din rădăcina proiectului

$ErrorActionPreference = "Stop"
$env:Path += ";C:\Program Files\Git\bin"

$root = (Get-Item $PSScriptRoot).Parent.FullName
Push-Location $root
Write-Host "Working in: $root" -ForegroundColor Gray

# Salvează versiunile curate
$backup = Join-Path $env:TEMP "formely-secret-fix"
New-Item -ItemType Directory -Force -Path $backup | Out-Null
if (Test-Path "$root\replacements.txt") { Copy-Item "$root\replacements.txt" "$backup\replacements.txt" -Force }
Copy-Item "$root\scripts\replace-hf-token.ps1" "$backup\replace-hf-token.ps1" -Force

Write-Host "Versiuni curate salvate în $backup" -ForegroundColor Green

# Rebase - schimbă automat pick în edit pentru 34d71b7
$batPath = (Resolve-Path "$root\scripts\rebase-editor.bat").Path
$env:GIT_SEQUENCE_EDITOR = "`"$batPath`""
git rebase -i 34d71b7^

if ($LASTEXITCODE -ne 0) {
    Write-Host "Rebase anulat sau eroare." -ForegroundColor Red
    exit 1
}

# Rebase-ul s-a oprit la 34d71b7 - aplică fișierele curate
Write-Host "`nAplic fișierele fără secret..." -ForegroundColor Cyan
if (Test-Path "$backup\replacements.txt") { Copy-Item "$backup\replacements.txt" "$root\replacements.txt" -Force }
Copy-Item "$backup\replace-hf-token.ps1" "$root\scripts\replace-hf-token.ps1" -Force

Set-Location $root
git add replacements.txt scripts/replace-hf-token.ps1
git commit --amend --no-edit
git rebase --continue

Pop-Location
Write-Host "`nGata! Acum rulează: git push --force origin main" -ForegroundColor Green
