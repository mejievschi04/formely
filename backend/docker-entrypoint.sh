#!/bin/sh
set -e

if [ -z "$APP_KEY" ]; then
  echo "FATAL: APP_KEY is not set or empty."
  echo "Set APP_KEY in the project root .env (next to docker-compose.yml), e.g.:"
  echo "  APP_KEY=base64:...   # php artisan key:generate --show"
  echo "Then: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate backend"
  exit 1
fi

# Așteaptă PostgreSQL și rulează migrații (retry până la 30 secunde)
echo "Waiting for database and running migrations..."
migrated=0
for i in $(seq 1 15); do
  if php artisan migrate --force; then
    migrated=1
    echo "Migrations completed."
    break
  fi
  echo "Database not ready, retrying in 2s... ($i/15)"
  sleep 2
done
if [ "$migrated" != "1" ]; then
  echo "FATAL: Database migrations did not complete."
  exit 1
fi

# Optimizări Laravel
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Storage link (dacă nu există)
php artisan storage:link 2>/dev/null || true

# Comenzile de mai sus rulează ca root; PHP-FPM (www-data) trebuie să poată scrie în cache și loguri.
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

exec "$@"
