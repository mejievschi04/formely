# Backend Laravel - folosim pachete Debian pre-compilate (fără compilare pdo_pgsql)
FROM debian:bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip gnupg bash \
    php8.2-fpm php8.2-cli php8.2-common \
    php8.2-pgsql php8.2-mysql php8.2-mbstring php8.2-xml php8.2-zip \
    php8.2-gd php8.2-bcmath php8.2-opcache php8.2-intl \
    git \
    && ln -sf /usr/bin/php8.2 /usr/bin/php \
    && rm -rf /var/lib/apt/lists/*

# Node 22 (Vite 7 + @tailwindcss/vite 4 cer Node >= 20.19; Debian bookworm are doar Node 18)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# PHP-FPM listen pe 9000
RUN sed -i 's/listen = .*/listen = 9000/' /etc/php/8.2/fpm/pool.d/www.conf

# Upload limits (library PDFs, backups, etc.)
# Note: `max` validator in Laravel is in KB; keep these in sync with app validation and nginx `client_max_body_size`.
RUN printf "upload_max_filesize=512M\npost_max_size=550M\nmax_execution_time=600\nmax_input_time=600\nmemory_limit=768M\n" \
    > /etc/php/8.2/fpm/conf.d/99-uploads.ini \
    && printf "upload_max_filesize=512M\npost_max_size=550M\nmax_execution_time=600\nmax_input_time=600\nmemory_limit=768M\n" \
    > /etc/php/8.2/cli/conf.d/99-uploads.ini

WORKDIR /var/www/html
# Dependency layers survive changes to application source.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction --prefer-dist
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN composer dump-autoload --no-dev --optimize --no-interaction && npm run build

RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 775 /var/www/html/storage \
    && chmod -R 775 /var/www/html/bootstrap/cache

# Stage producție
FROM base AS production

# Opcache: fișierele se reverifică pe disc cel mult o dată pe minut, nu la fiecare request.
# Codul e montat din host (docker-compose), deci un `git pull` fără restart e preluat în ≤60 s;
# scripts/deploy-vps.sh face oricum restart backend după pull.
RUN printf "opcache.enable=1\nopcache.memory_consumption=256\nopcache.interned_strings_buffer=16\nopcache.max_accelerated_files=20000\nopcache.validate_timestamps=1\nopcache.revalidate_freq=60\nrealpath_cache_size=4096K\nrealpath_cache_ttl=600\n" \
    > /etc/php/8.2/fpm/conf.d/99-opcache.ini

# Pool PHP-FPM: implicit Debian e pm.max_children=5, prea puțin pentru SPA (cereri paralele + polling).
# Fiecare worker folosește de obicei 40–80 MB; valorile se pot ajusta din env fără rebuild.
ENV PHP_FPM_MAX_CHILDREN=16 \
    PHP_FPM_START_SERVERS=4 \
    PHP_FPM_MIN_SPARE_SERVERS=2 \
    PHP_FPM_MAX_SPARE_SERVERS=6 \
    PHP_FPM_MAX_REQUESTS=500
RUN printf "[www]\npm = dynamic\npm.max_children = \${PHP_FPM_MAX_CHILDREN}\npm.start_servers = \${PHP_FPM_START_SERVERS}\npm.min_spare_servers = \${PHP_FPM_MIN_SPARE_SERVERS}\npm.max_spare_servers = \${PHP_FPM_MAX_SPARE_SERVERS}\npm.max_requests = \${PHP_FPM_MAX_REQUESTS}\n" \
    > /etc/php/8.2/fpm/pool.d/zz-volta.conf

WORKDIR /var/www/html
COPY --from=base --chown=www-data:www-data /var/www/html /var/www/html
RUN chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 9000
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm8.2", "--nodaemonize"]
