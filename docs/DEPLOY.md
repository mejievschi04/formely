# Formely — deploy pe VPS cu Docker + Nginx pe host
#
# Domenii:
#   https://formely.org           — website
#   https://api.formely.org       — API Laravel
#   https://academy.formely.org   — LMS
#   https://demo.formely.org      — același cod LMS, bază demo separată
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

demo.formely.org → Nginx host → 127.0.0.1:13002 (demo-frontend → demo-api → demo-backend)
demo-postgres · demo-queue · demo-scheduler — rețea demo separată

postgres · backend · queue · scheduler  (doar rețea Docker, fără port public)
```

Nu pornim Caddy — pe acest VPS Nginx pe host deține deja 80/443.
Porturile Formely sunt doar pe `127.0.0.1` (nu se ciocnesc cu alte proiecte pe 8000/8080).
Postgres Formely **nu** ocupă 5432 pe host — rulează intern în Docker (`postgres:5432`). Dacă pe VPS ai deja Postgres pe 5432, e OK; cele două nu se ating.

## Cerințe

- Docker Engine + Compose **v2.24.4+** (suport `!override`)
- Nginx pe host + Certbot
- DNS A către IP-ul VPS pentru cele 6 hosturi
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

Dacă imaginea e veche și tot cere APP_KEY, folosește:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps --entrypoint php backend artisan key:generate --show
```

**Atenție `$` în `.env`:** Docker Compose interpretează variabile. Dacă o parolă conține `$`, dublează: `pa$$word`. Warning-ul `The "V" variable is not set` vine de obicei de la un `$V...` neescapat în `.env`.

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
  -d admin.formely.org \
  -d demo.formely.org
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
| demo.formely.org | A | IP VPS |

## Demo cu bază de date separată

Demo-ul folosește aceleași surse și Dockerfile-uri ca LMS-ul. Procesele Laravel ale demo-ului primesc conexiunea la `demo-postgres`; nu există selectarea bazei dinamic după parametrii cererii. Volumele DB, storage și cache și rețeaua Docker sunt separate. Worker-ul și scheduler-ul demo folosesc aceeași bază demo. Nu se publică port PostgreSQL pe host.

Pe instanța principală, Compose forțează `FORMELY_DEMO_INSTANCE=false` și `FORMELY_DEMO_LOGIN_ENABLED=false`. Seed-ul demo refuză instanța principală în producție. Datele demo care există deja în baza principală nu sunt mutate sau șterse automat.

În `.env` de la rădăcină setează:

```dotenv
DEMO_DB_DATABASE=formely_demo
DEMO_DB_USERNAME=formely_demo_user
DEMO_DB_PASSWORD=PAROLA_DEMO_DISTINCTA
DEMO_APP_KEY=base64:CHEIE_GENERATA_SEPARAT
DEMO_URL=https://demo.formely.org
DEMO_PORT=13002
VITE_DEMO_URL=https://demo.formely.org
DEPLOY_DEMO=1
DEPLOY_DEMO_SEED=0
```

Generează cheia demo fără să schimbi cheia aplicației principale:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps --entrypoint php backend artisan key:generate --show
```

Copiază rezultatul în `DEMO_APP_KEY`. Prima pornire și populare cu date fictive:

```bash
DEPLOY_DEMO=1 DEPLOY_DEMO_SEED=1 ./scripts/deploy-vps.sh
```

La deploy-urile următoare păstrează `DEPLOY_DEMO=1` în `.env` și `DEPLOY_DEMO_SEED=0`. Migrațiile demo rulează la pornirea backend-ului, pe baza demo. Seed-ul este o operație explicită; nu folosește `migrate:fresh` și nu copiază date reale.

DNS: creează înregistrarea A pentru `demo.formely.org`. Instalează configurația Nginx actualizată și certificatul TLS ca în pașii de mai sus. Dacă ai schimbat `DEMO_PORT`, actualizează și upstream-ul `formely_demo` în configurația Nginx host.

Rădăcina `demo.formely.org` și `/login` redirecționează către intrarea automată `/demo`. Vechiul `academy.formely.org/demo` redirecționează către domeniul demo. Cookie-ul demo este limitat la host și folosește numele `formely_demo_session`; deschiderea demo-ului nu înlocuiește sesiunea academiei. Demo-ul păstrează restricțiile existente: modificările nu se salvează. AI este oprit, iar emailurile sunt scrise doar în logul demo.

Verificări după deploy:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.demo.yml config --quiet
curl --fail -H 'Host: demo.formely.org' http://127.0.0.1:13002/api/health
curl --fail https://demo.formely.org/api/health
```

În browser, autentifică-te în academie, deschide demo-ul în alt tab și verifică păstrarea sesiunii inițiale. Verifică ghidul demo și blocarea modificărilor. Backup-ul bazei principale nu include demo-ul; dacă ai nevoie de copii ale demo-ului, rulează backup separat pe serviciul `demo-postgres`.

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
