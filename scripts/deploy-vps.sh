#!/bin/bash
# Deploy complet Formely pe VPS (Docker + Caddy + domenii formely.org)
# Folosire: cd /var/www/app && chmod +x scripts/deploy-vps.sh && ./scripts/deploy-vps.sh
# Opțional: DEPLOY_PRUNE=1 ./scripts/deploy-vps.sh
# Opțional: DEPLOY_SEED=1 ./scripts/deploy-vps.sh  → ProductionSeeder după migrate

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "Formely — deploy VPS"
echo "===================="

if [ ! -f .env ]; then
  echo "Eroare: lipsește .env (lângă docker-compose.yml)."
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${APP_KEY:-}" ]; then
  echo "Eroare: APP_KEY e gol în .env. Generează:"
  echo "  ${COMPOSE[*]} run --rm --no-deps backend php artisan key:generate --show"
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

echo ">>> build (backend, academy, website, backoffice)"
"${COMPOSE[@]}" build --no-cache

echo ">>> pornire servicii"
"${COMPOSE[@]}" up -d

echo ">>> așteptare backend"
sleep 12

echo ">>> migrații"
"${COMPOSE[@]}" exec -T backend php artisan migrate --force

if [ "${DEPLOY_SEED:-0}" = "1" ]; then
  echo ">>> ProductionSeeder"
  "${COMPOSE[@]}" exec -T backend php artisan db:seed --class=ProductionSeeder --force
fi

echo ">>> cache Laravel"
"${COMPOSE[@]}" exec -T backend php artisan optimize:clear
"${COMPOSE[@]}" exec -T backend php artisan config:cache
"${COMPOSE[@]}" exec -T backend php artisan route:cache
"${COMPOSE[@]}" exec -T backend php artisan view:cache

echo ">>> permisiuni storage"
"${COMPOSE[@]}" exec -T backend chmod -R 775 storage bootstrap/cache
"${COMPOSE[@]}" exec -T backend chown -R www-data:www-data storage bootstrap/cache || true

echo ">>> restart aplicație"
"${COMPOSE[@]}" restart backend frontend website backoffice nginx-backend queue scheduler caddy

echo ""
echo ">>> status"
"${COMPOSE[@]}" ps
echo ""

HEALTH_URL="${APP_URL%/}/api/health"
echo ">>> verificare $HEALTH_URL"
if command -v curl &> /dev/null; then
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
  echo "    HTTP $code"
  if [ "$code" != "200" ]; then
    echo "    Dacă DNS/TLS încă propagă, reîncearcă în câteva minute."
    echo "    Loguri: ${COMPOSE[*]} logs --tail=80 caddy backend"
  fi
else
  echo "    (instalează curl pentru verificare automată)"
fi

if [ "${DEPLOY_PRUNE:-0}" = "1" ]; then
  echo ""
  echo ">>> curățare Docker (fără volume)"
  docker image prune -af
  docker system prune -f
fi

echo ""
echo "Gata."
echo "  Website:   https://formely.org"
echo "  API:       https://api.formely.org/api/health"
echo "  Academy:   https://academy.formely.org"
echo "  Admin:     https://admin.formely.org"
echo "Loguri: ${COMPOSE[*]} logs -f caddy backend"
