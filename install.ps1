# ORIM Installer — Windows (PowerShell 5.1+)
# Usage: .\install.ps1  OR  irm https://raw.githubusercontent.com/axpie/orim/main/install.ps1 | iex
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✖  $msg" -ForegroundColor Red; exit 1 }
function Write-Head  { param($msg) Write-Host "`n$msg" -ForegroundColor White }

function New-RandomSecret {
    param([int]$Length = 48)
    $bytes = [byte[]]::new($Length)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Substring(0, $Length) -replace '[/+=]', 'x'
}

function Read-Value {
    param([string]$Prompt, [string]$Default, [switch]$Secret)
    $display = if ($Default) { " [$Default]" } else { " [auto-generated]" }
    Write-Host "  $Prompt$display`: " -NoNewline
    if ($Secret) {
        $raw = Read-Host -AsSecureString
        $val = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                   [Runtime.InteropServices.Marshal]::SecureStringToBSTR($raw))
    } else {
        $val = Read-Host
    }
    return if ($val) { $val } else { $Default }
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ██████╗ ██████╗ ██╗███╗   ███╗" -ForegroundColor Cyan
Write-Host "  ██╔═══██╗██╔══██╗██║████╗ ████║" -ForegroundColor Cyan
Write-Host "  ██║   ██║██████╔╝██║██╔████╔██║" -ForegroundColor Cyan
Write-Host "  ██║   ██║██╔══██╗██║██║╚██╔╝██║" -ForegroundColor Cyan
Write-Host "  ╚██████╔╝██║  ██║██║██║ ╚═╝ ██║" -ForegroundColor Cyan
Write-Host "   ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝" -ForegroundColor Cyan
Write-Host "  Collaborative Whiteboard — Installer`n"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
Write-Head "Checking requirements"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker is not installed. Get it at https://docs.docker.com/get-docker/"
}

try { docker info 2>&1 | Out-Null }
catch { Write-Fail "Docker is not running. Please start Docker Desktop and try again." }
if ($LASTEXITCODE -ne 0) { Write-Fail "Docker is not running. Please start Docker Desktop and try again." }

try { docker compose version 2>&1 | Out-Null }
catch { Write-Fail "Docker Compose is not available. Update Docker Desktop." }

$dockerVersion = (docker --version) -replace '.*?(\d+\.\d+\.\d+).*','$1'
Write-Ok "Docker $dockerVersion"

# ── Choose install directory ──────────────────────────────────────────────────
Write-Head "Install location"
$defaultDir = Join-Path $env:USERPROFILE "orim"
$installDir = Read-Value -Prompt "Install directory" -Default $defaultDir

if (Test-Path (Join-Path $installDir "docker-compose.yml")) {
    Write-Warn "An existing installation was found at $installDir."
    $overwrite = Read-Value -Prompt "Overwrite configuration and restart? [y/N]" -Default "N"
    if ($overwrite -notmatch '^[Yy]$') { Write-Host "Aborted."; exit 0 }
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# ── Configuration ─────────────────────────────────────────────────────────────
Write-Head "Configuration"
Write-Host "  Press Enter to accept the suggested value shown in brackets.`n"

$suggestedPg  = New-RandomSecret -Length 24
$suggestedJwt = New-RandomSecret -Length 48

$adminPassword = Read-Value -Prompt "Admin password        " -Default "Admin123!"
$pgPassword    = Read-Value -Prompt "PostgreSQL password   " -Default $suggestedPg
$jwtKey        = Read-Value -Prompt "JWT secret key        " -Default $suggestedJwt
$port          = Read-Value -Prompt "Host port             " -Default "5000"

# ── Write docker-compose.yml ──────────────────────────────────────────────────
Write-Head "Writing configuration"

$composeContent = @"
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: orim
      POSTGRES_PASSWORD: "$pgPassword"
      POSTGRES_DB: orim
    volumes:
      - orim-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orim"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  orim:
    image: ghcr.io/axpie/orim:latest
    ports:
      - "${port}:5000"
    environment:
      ConnectionStrings__DefaultConnection: "Host=db;Port=5432;Database=orim;Username=orim;Password=$pgPassword"
      Jwt__Key: "$jwtKey"
      SeedAdmin__Password: "$adminPassword"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  orim-pgdata:
"@

$composePath = Join-Path $installDir "docker-compose.yml"
Set-Content -Path $composePath -Value $composeContent -Encoding UTF8
Write-Ok "docker-compose.yml written to $installDir"

# ── Pull & start ──────────────────────────────────────────────────────────────
Write-Head "Starting ORIM"
Push-Location $installDir

Write-Step "Pulling latest images..."
docker compose pull --quiet

Write-Step "Starting containers..."
docker compose up -d

Pop-Location

# ── Wait for healthy ──────────────────────────────────────────────────────────
Write-Head "Waiting for ORIM to become ready"
$retries = 30
$ready = $false
while ($retries -gt 0) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/health/live" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    $retries--
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ""

if (-not $ready) {
    Write-Warn "ORIM did not respond in time."
    Write-Warn "Check logs with: docker compose -f `"$composePath`" logs orim"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ORIM is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  URL      " -NoNewline; Write-Host "http://localhost:$port" -ForegroundColor White
Write-Host "  Username " -NoNewline; Write-Host "admin" -ForegroundColor White
Write-Host "  Password " -NoNewline; Write-Host "$adminPassword" -ForegroundColor White
Write-Host ""
Write-Host "  Manage:  docker compose -f `"$composePath`" [stop|start|logs|pull]"
Write-Host "  Update:  docker compose -f `"$composePath`" pull; docker compose -f `"$composePath`" up -d"
Write-Host ""
