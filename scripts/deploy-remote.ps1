# Deploy Formely pe VPS din Windows — fără login interactiv pe server.
# Necesită: OpenSSH (ssh), Git, Docker pe VPS, deploy.env configurat.
#
# Prima dată pe VPS: clone repo, cp .env.example .env, completează APP_KEY etc.
#
# Utilizare (din rădăcina proiectului):
#   cp deploy.env.example deploy.env
#   notepad deploy.env
#   .\scripts\deploy-remote.ps1
#
# Opțiuni:
#   .\scripts\deploy-remote.ps1 -Push          # git push origin main înainte de deploy
#   .\scripts\deploy-remote.ps1 -SkipGitPull   # nu face git pull pe VPS (doar rebuild)
#   .\scripts\deploy-remote.ps1 -Prune           # curățare imagini Docker pe VPS după deploy

param(
    [switch]$Push,
    [switch]$SkipGitPull,
    [switch]$Prune,
    [string]$Host,
    [string]$User,
    [string]$Path,
    [string]$SshKey,
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

function Read-DeployEnvFile {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) { return }
    Get-Content $FilePath -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

Read-DeployEnvFile (Join-Path $ProjectRoot "deploy.env")

if ($Host) { $env:VPS_HOST = $Host }
if ($User) { $env:VPS_USER = $User }
if ($Path) { $env:VPS_PATH = $Path }
if ($SshKey) { $env:VPS_SSH_KEY = $SshKey }
if ($env:VPS_GIT_BRANCH) { $Branch = $env:VPS_GIT_BRANCH }

$vpsHost = $env:VPS_HOST
$vpsUser = $env:VPS_USER
$vpsPath = $env:VPS_PATH
$sshKey = $env:VPS_SSH_KEY

if (-not $vpsHost -or -not $vpsUser -or -not $vpsPath) {
    Write-Host "Lipsește configurarea VPS." -ForegroundColor Red
    Write-Host "  cp deploy.env.example deploy.env" -ForegroundColor Yellow
    Write-Host "  Completează VPS_HOST, VPS_USER, VPS_PATH" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "OpenSSH (ssh) nu e în PATH. Instalează „OpenSSH Client” din Windows Optional Features." -ForegroundColor Red
    exit 1
}

Write-Host "Formely — deploy remote" -ForegroundColor Cyan
Write-Host "  VPS: ${vpsUser}@${vpsHost}:${vpsPath}" -ForegroundColor DarkGray

if ($Push) {
    Write-Host ">>> git push origin $Branch" -ForegroundColor Yellow
    git push origin $Branch
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$remoteEnv = @()
if ($SkipGitPull) { $remoteEnv += "DEPLOY_SKIP_GIT=1" }
if ($Prune) { $remoteEnv += "DEPLOY_PRUNE=1" }
$envPrefix = if ($remoteEnv.Count -gt 0) { ($remoteEnv -join " ") + " " } else { "" }

$remoteScript = @"
set -eo pipefail
cd '$($vpsPath -replace "'", "'\''")'
if [ ! -f .env ]; then
  echo 'Eroare: lipsește .env pe VPS în $vpsPath'
  exit 1
fi
if [ ! -x scripts/deploy-vps.sh ]; then
  chmod +x scripts/deploy-vps.sh
fi
${envPrefix}./scripts/deploy-vps.sh
"@

$sshTarget = "${vpsUser}@${vpsHost}"
$sshArgs = @()
if ($sshKey) {
    $resolvedKey = Resolve-Path $sshKey -ErrorAction Stop
    $sshArgs += "-i", $resolvedKey.Path
}
$sshArgs += "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"

Write-Host ">>> SSH deploy pe VPS..." -ForegroundColor Yellow
# bash -s: scriptul rulează pe server (Linux)
$remoteScript | & ssh @sshArgs $sshTarget "bash -s"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy eșuat (cod $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Deploy finalizat." -ForegroundColor Green
if ($env:APP_URL) {
    Write-Host "  Verifică: $($env:APP_URL.TrimEnd('/'))/api/health" -ForegroundColor DarkGray
} else {
    Write-Host "  Verifică în browser site-ul tău + /api/health" -ForegroundColor DarkGray
}
