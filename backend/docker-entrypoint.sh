#!/bin/sh
set -e

# Permite generarea cheii fără APP_KEY (bootstrap circular altfel).
case " $* " in
  *" artisan key:generate "*|*" key:generate "*)
    exec "$@"
    ;;
esac

if [ -z "$APP_KEY" ]; then
  echo "FATAL: APP_KEY is not set or empty."
  echo "Generează una (fără a porni tot stack-ul):"
  echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps backend php artisan key:generate --show"
  echo "Lipește rezultatul în .env ca APP_KEY=base64:..."
  exit 1
fi

# Directoare framework necesare (volume-ul storage poate fi gol la primul start)
mkdir -p \
  storage/framework/sessions \
  storage/framework/views \
  storage/framework/cache/data \
  storage/logs \
  storage/app/public \
  bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

# Așteaptă PostgreSQL și rulează migrații (retry până la 30 secunde)
echo "Waiting for database and running migrations..."
for i in $(seq 1 15); do
  if php artisan migrate --force; then
    echo "Migrations completed."
    break
  fi
  echo "Database not ready, retrying in 2s... ($i/15)"
  sleep 2
done

# Optimizări Laravel
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Storage link (dacă nu există)
php artisan storage:link 2>/dev/null || true

exec "$@"
