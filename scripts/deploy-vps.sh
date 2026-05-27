#!/bin/bash
# Deploy complet Formely pe VPS (Docker + producție)
# Folosire: cd /var/www/app/Formely && chmod +x scripts/deploy-vps.sh && ./scripts/deploy-vps.sh
# Opțional: DEPLOY_PRUNE=1 ./scripts/deploy-vps.sh  → șterge imagini nefolosite + prune sistem (fără volume)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "Formely — deploy VPS"
echo "=========================="

if [ ! -f .env ]; then
  echo "Eroare: lipsește .env în rădăcina proiectului (lângă docker-compose.yml)."
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

# Încarcă .env pentru verificări (aceleași variabile le folosește și docker compose)
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${APP_KEY:-}" ]; then
  echo "Eroare: APP_KEY e gol în .env. Generează:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend php artisan key:generate --show"
  exit 1
fi

if [ "${DEPLOY_SKIP_GIT:-0}" != "1" ] && [ -d .git ]; then
  echo ">>> git pull"
  git pull origin main || git pull origin master
fi

if ! command -v docker &> /dev/null; then
  echo "Eroare: Docker nu e instalat."
  exit 1
fi

echo ">>> build (fără cache) — include frontend + backend"
"${COMPOSE[@]}" build --no-cache

echo ">>> pornire servicii"
"${COMPOSE[@]}" up -d

echo ">>> așteptare backend"
sleep 8

echo ">>> migrații"
"${COMPOSE[@]}" exec -T backend php artisan migrate --force

echo ">>> cache Laravel (după deploy)"
"${COMPOSE[@]}" exec -T backend php artisan optimize:clear
"${COMPOSE[@]}" exec -T backend php artisan config:cache
"${COMPOSE[@]}" exec -T backend php artisan route:cache
"${COMPOSE[@]}" exec -T backend php artisan view:cache

echo ">>> permisiuni storage"
"${COMPOSE[@]}" exec -T backend chmod -R 775 storage bootstrap/cache
"${COMPOSE[@]}" exec -T backend chown -R www-data:www-data storage bootstrap/cache || true

echo ">>> restart servicii aplicație (asigură reload după cache)"
"${COMPOSE[@]}" restart backend frontend

echo ""
echo ">>> status"
"${COMPOSE[@]}" ps
echo ""

# Health: folosește APP_URL din .env dacă e setat
if [ -n "${APP_URL:-}" ]; then
  HEALTH_URL="${APP_URL%/}/api/health"
  echo ">>> verificare $HEALTH_URL"
  if command -v curl &> /dev/null; then
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
    echo "    HTTP $code"
    if [ "$code" != "200" ]; then
      echo "    (așteaptă câteva secunde și verifică manual; dacă persistă: logs backend)"
    fi
  else
    echo "    (instalează curl pentru verificare automată)"
  fi
fi

if [ "${DEPLOY_PRUNE:-0}" = "1" ]; then
  echo ""
  echo ">>> curățare Docker (DEPLOY_PRUNE=1) — NU folosi -v la system prune"
  docker ps -a
  docker image prune -af
  docker system prune -f
else
  echo ""
  echo "Curățare imagini: rulează manual dacă ai nevoie de spațiu:"
  echo "  DEPLOY_PRUNE=1 $0"
fi

echo ""
echo "Gata. Loguri: ${COMPOSE[*]} logs -f backend"
