# Formely — deploy pe VPS cu Docker + Nginx pe host
#
# Domenii:
#   https://formely.org           — website
#   https://api.formely.org       — API Laravel
#   https://academy.formely.org   — LMS
#   https://admin.formely.org     — backoffice
#
# Path pe VPS: /var/www/app/formely

## Arhitectură (VPS cu Nginx existent pe 80/443)

```
Internet → Nginx host (:80/:443, Certbot)
             ├─ formely.org          → 127.0.0.1:14322  (website)
             ├─ api.formely.org      → 127.0.0.1:18080  (nginx-backend → PHP-FPM)
             ├─ academy.formely.org  → 127.0.0.1:13001  (frontend, proxy /api intern)
             └─ admin.formely.org    → 127.0.0.1:15181  (backoffice)

postgres · backend · queue · scheduler  (doar rețea Docker, fără port public)
```

Nu pornim Caddy — pe acest VPS Nginx pe host deține deja 80/443.
Porturile Formely sunt doar pe `127.0.0.1` (nu se ciocnesc cu alte proiecte pe 8000/8080).
Postgres Formely **nu** ocupă 5432 pe host — rulează intern în Docker (`postgres:5432`). Dacă pe VPS ai deja Postgres pe 5432, e OK; cele două nu se ating.

## Cerințe

- Docker Engine + Compose **v2.24+**
- Nginx pe host + Certbot
- DNS A către IP-ul VPS pentru cele 5 hosturi
- Nu expune Postgres public

## Prima instalare

### 1. Env

```bash
cd /var/www/app/formely
cp .env.example .env
nano .env
```

Completează: `DB_PASSWORD`, `FORMELY_PLATFORM_OPERATOR_PASSWORD`, SMTP (sau `MAIL_MAILER=log`).

Generează `APP_KEY`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps backend php artisan key:generate --show
# lipește în .env: APP_KEY=base64:...
```

### 2. Pornire containere

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

### 3. Nginx pe host + TLS

```bash
sudo cp docker/nginx-host/formely.conf /etc/nginx/sites-available/formely.conf
sudo ln -sf /etc/nginx/sites-available/formely.conf /etc/nginx/sites-enabled/formely.conf
sudo nginx -t && sudo systemctl reload nginx

# după ce DNS arată spre acest VPS:
sudo certbot --nginx \
  -d formely.org -d www.formely.org \
  -d api.formely.org \
  -d academy.formely.org \
  -d admin.formely.org
```

### 4. Operator platformă (o dată)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  php artisan db:seed --class=ProductionSeeder
```

## Verificări

```bash
curl -sS http://127.0.0.1:18080/api/health
curl -sS https://api.formely.org/api/health
curl -sSI https://formely.org | head -5
curl -sSI https://academy.formely.org | head -5
curl -sSI https://admin.formely.org | head -5
```

Loguri:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend queue
sudo tail -f /var/log/nginx/error.log
```

## DNS

| Host | Tip | Valoare |
|------|-----|---------|
| formely.org | A | IP VPS |
| www.formely.org | A | IP VPS |
| api.formely.org | A | IP VPS |
| academy.formely.org | A | IP VPS |
| admin.formely.org | A | IP VPS |

## Deploy ulterior

```bash
cd /var/www/app/formely
./scripts/deploy-vps.sh
```

## SMTP

Până ai SMTP real, lasă `MAIL_MAILER=log`. Invitațiile pot fi copiate din backoffice.

## Backup (minim)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U formely_user formely > backup-$(date +%F).sql
```
