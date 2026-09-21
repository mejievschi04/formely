# Formely — deploy pe VPS cu Docker
#
# Domenii:
#   https://formely.org           — website
#   https://api.formely.org       — API Laravel
#   https://academy.formely.org   — LMS
#   https://admin.formely.org     — backoffice

## Arhitectură

```
Internet → Caddy (:80/:443, TLS)
             ├─ formely.org          → website
             ├─ api.formely.org      → nginx-backend → PHP-FPM
             ├─ academy.formely.org  → frontend (proxy /api → backend)
             └─ admin.formely.org    → backoffice (proxy /api → backend)

postgres · backend · queue · scheduler  (rețea internă)
```

Academy și admin folosesc **same-origin `/api`** (proxy Nginx) — cookie Sanctum pe subdomeniul respectiv.
Website-ul apelează `https://api.formely.org/api/leads` (CORS).

## Cerințe VPS

- Ubuntu 22.04+ (sau similar)
- Docker Engine + Compose **v2.24+** (`docker compose version`)
- DNS A (sau AAAA) către IP-ul VPS:
  - `formely.org`
  - `www.formely.org`
  - `api.formely.org`
  - `academy.formely.org`
  - `admin.formely.org`
- Porturi deschise: **80**, **443** (și 22 pentru SSH)
- Nu expune 5432 public

## Prima instalare

```bash
# pe VPS
# pe VPS — proiectul stă în /var/www/app
cd /var/www/app
cp .env.example .env
nano .env   # APP_KEY, DB_PASSWORD, SMTP, FORMELY_PLATFORM_OPERATOR_PASSWORD, CADDY_EMAIL
```

Generează `APP_KEY` (o dată):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps backend php artisan key:generate --show
# lipește rezultatul în .env ca APP_KEY=base64:...
```

Deploy:

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

Seed operator platformă (o dată, după migrate):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  php artisan db:seed --class=ProductionSeeder
```

## Verificări

```bash
curl -sS https://api.formely.org/api/health
curl -sSI https://formely.org | head -5
curl -sSI https://academy.formely.org | head -5
curl -sSI https://admin.formely.org | head -5
```

Loguri:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy backend queue
```

## DNS

| Host | Tip | Valoare |
|------|-----|---------|
| formely.org | A | IP VPS |
| www.formely.org | A | IP VPS |
| api.formely.org | A | IP VPS |
| academy.formely.org | A | IP VPS |
| admin.formely.org | A | IP VPS |

Caddy obține certificate Let's Encrypt automat după ce DNS propagă.
Email ACME: `CADDY_EMAIL` din `.env`.

## Deploy ulterior

Din VPS:

```bash
./scripts/deploy-vps.sh
```

De pe mașina locală (Windows/macOS), după `cp deploy.env.example deploy.env`:

```powershell
.\scripts\deploy-remote.ps1 -Push
```

## SMTP

Până setezi SMTP real (`MAIL_MAILER=smtp` + host/user/pass), mail-urile merg în log.
Invitațiile pot fi copiate din output-ul `formely:provision-company` / backoffice.

## Firewall (exemplu UFW)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Backup (minim)

- Volume `postgres_data` + `backend_storage`
- Exemplu dump:  
  `docker compose … exec -T postgres pg_dump -U formely_user formely > backup-$(date +%F).sql`
