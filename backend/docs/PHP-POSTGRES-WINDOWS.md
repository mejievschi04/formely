# PostgreSQL cu PHP pe Windows

Proiectul folosește **PostgreSQL** (`DB_CONNECTION=pgsql`). Pe Windows ai nevoie de:
1. **PostgreSQL** instalat (server + `libpq.dll`)
2. **PHP** cu extensiile `pdo_pgsql` și `pgsql` (DLL-urile `php_pdo_pgsql.dll` și `php_pgsql.dll`)

---

## Dacă `php_pgsql.dll` lipsește din folderul PHP `ext`

Build-urile oficiale de pe windows.php.net **nu includ** întotdeauna pgsql. Iată cum poți rămâne pe Postgres.

### Pas 1: Instalează PostgreSQL pentru Windows

1. Descarcă instalatorul de pe [postgresql.org/download/windows/](https://www.postgresql.org/download/windows/).
2. Instalează (ex: versiunea 16 sau 17). Notează calea, de ex. `C:\Program Files\PostgreSQL\16\`.
3. La final ai:
   - **Serverul PostgreSQL** (rulează ca serviciu)
   - **libpq.dll** în `C:\Program Files\PostgreSQL\16\bin\libpq.dll` – necesar pentru extensiile PHP pgsql

### Pas 2: PHP cu suport PostgreSQL

Trebuie un PHP care are în folderul `ext` fișierele:
- `php_pgsql.dll`
- `php_pdo_pgsql.dll`

**Variante:**

- **Laragon (recomandat)**  
  - Descarcă [Laragon Full](https://laragon.org/download/) (sau cel cu PHP inclus).  
  - În `laragon\bin\php\php-8.x\ext` verifică dacă există `php_pgsql.dll` și `php_pdo_pgsql.dll`.  
  - Dacă da: în Laragon poți alege acest PHP și folosești calea lui în proiect.  
  - Dacă nu: unele versiuni Laragon permit adăugarea de extensii; verifică documentația sau încearcă un alt PHP din Laragon.

- **PHP de pe windows.php.net**  
  - Descarcă zip-ul pentru versiunea ta (ex: PHP 8.4, VS17 x64, Thread Safe sau NTS) de pe [windows.php.net/download](https://windows.php.net/download/).  
  - Dezarhivează și verifică în folderul `ext`: dacă există `php_pgsql.dll` și `php_pdo_pgsql.dll`, le poți folosi (vezi Pas 3).  
  - Dacă **nu** sunt în zip, acel build nu include pgsql; atunci folosește Laragon sau un alt stack care oferă PHP cu pgsql.

- **XAMPP**  
  - Unele versiuni XAMPP au pgsql în `xampp\php\ext`. Verifică acolo; dacă există, activează în `php.ini` (Pas 3).

### Pas 3: Configurează PHP să încarce pgsql

1. **Adaugă `bin`-ul PostgreSQL la PATH** (ca PHP să găsească `libpq.dll`):
   - Exemplu: `C:\Program Files\PostgreSQL\16\bin`
   - Setare: Setări Windows → „Variabile de mediu” → Variabile de mediu pentru cont → Path → Editează → Nou → lipește calea → OK.

2. **Găsește `php.ini`**:
   ```bash
   php --ini
   ```
   Folosește calea de la „Loaded Configuration File”.

3. **Activează extensiile** în `php.ini` (scoate `;` de la început dacă există):
   ```ini
   extension=pdo_pgsql
   extension=pgsql
   ```

4. **Repornește** serverul (Apache/Nginx/Laragon) sau procesul care rulează PHP.

5. **Verifică**:
   ```bash
   php -m
   ```
   În listă trebuie să apară `pdo_pgsql` și `pgsql`.

### Pas 4: Conectare aplicație

În `.env` păstrezi, de ex.:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=volta_academy
DB_USERNAME=postgres
DB_PASSWORD=...
```

Asigură-te că serverul PostgreSQL rulează (serviciu Windows sau „Start” din Laragon pentru Postgres, dacă îl folosești).

---

## Dacă ai deja DLL-urile în `ext` (doar dezactivate)

1. Adaugă la PATH calea la `bin`-ul PostgreSQL (vezi Pas 3.1).
2. În `php.ini` activează:
   ```ini
   extension=pdo_pgsql
   extension=pgsql
   ```
3. Repornește serverul și rulează `php -m` pentru verificare.

---

## Deprecation PDO::MYSQL_ATTR_SSL_CA (PHP 8.5)

Mesajele din **vendor\laravel\framework\config\database.php** vin din Laravel. Config-ul aplicației (`config/database.php`) e deja adaptat. Poți rula `composer update` când Laravel va avea suport, sau în `php.ini` poți seta temporar `error_reporting = E_ALL & ~E_DEPRECATED` dacă vrei să ascunzi deprecările.

---

## Alternativă: SQLite doar pentru dev local

Dacă pe o mașină nu poți folosi PostgreSQL (de ex. nu găsești PHP cu `php_pgsql.dll`), poți rula local pe SQLite: în `.env` pune `DB_CONNECTION=sqlite`, creezi `database\database.sqlite` și rulezi `php artisan migrate`. Producția rămâne pe Postgres.
