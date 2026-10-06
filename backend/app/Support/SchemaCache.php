<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * Înlocuitor pentru Schema::hasTable / Schema::hasColumn la runtime.
 *
 * Laravel interoghează catalogul bazei de date la fiecare apel (pe Postgres, câte un query
 * pe pg_catalog). Aici structura unui tabel se citește o singură dată, se ține în cache
 * și se invalidează automat după fiecare `migrate` (vezi AppServiceProvider).
 */
final class SchemaCache
{
    private const PREFIX = 'schema-cache:v1:';

    /** @var array<string, array{exists: bool, columns: array<string, true>}> */
    private static array $tables = [];

    private static ?int $generation = null;

    public static function hasTable(string $table): bool
    {
        return self::describe($table)['exists'];
    }

    public static function hasColumn(string $table, string $column): bool
    {
        return isset(self::describe($table)['columns'][strtolower($column)]);
    }

    public static function flush(): void
    {
        // Generația nouă invalidează cheile scrise de orice proces (worker, FPM).
        Cache::forever(self::PREFIX . 'generation', (int) Cache::get(self::PREFIX . 'generation', 0) + 1);
        self::$tables = [];
        self::$generation = null;
    }

    /**
     * @return array{exists: bool, columns: array<string, true>}
     */
    private static function describe(string $table): array
    {
        $key = self::key($table);

        return self::$tables[$key] ??= Cache::rememberForever($key, function () use ($table) {
            $exists = Schema::hasTable($table);
            $columns = $exists
                ? array_fill_keys(array_map(strtolower(...), Schema::getColumnListing($table)), true)
                : [];

            return ['exists' => $exists, 'columns' => $columns];
        });
    }

    private static function key(string $table): string
    {
        $connection = (string) config('database.default');
        $database = (string) config("database.connections.{$connection}.database");
        $generation = self::$generation ??= (int) Cache::get(self::PREFIX . 'generation', 0);

        return self::PREFIX . md5($connection . '|' . $database) . ':' . $generation . ':' . strtolower($table);
    }
}
