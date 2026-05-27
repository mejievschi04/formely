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
COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
RUN npm install && npm run build

RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 775 /var/www/html/storage \
    && chmod -R 775 /var/www/html/bootstrap/cache

# Stage producție
FROM base AS production

RUN echo "opcache.enable=1" > /etc/php/8.2/fpm/conf.d/99-opcache.ini \
    && echo "opcache.memory_consumption=128" >> /etc/php/8.2/fpm/conf.d/99-opcache.ini

WORKDIR /var/www/html
COPY --from=base --chown=www-data:www-data /var/www/html /var/www/html
RUN chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 9000
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm8.2", "--nodaemonize"]
