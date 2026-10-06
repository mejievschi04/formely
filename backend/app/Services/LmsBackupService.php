<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use App\Support\SchemaCache;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

class LmsBackupService
{
    public function backupRoot(): string
    {
        return (string) config('volta.backup_root', storage_path('app/lms-backups'));
    }

    public function shouldRunScheduledBackup(): bool
    {
        if (! (bool) Setting::get('backup_enabled', false)) {
            return false;
        }

        $last = Setting::get('backup_last_at');
        if (! is_string($last) || trim($last) === '') {
            return true;
        }

        try {
            $lastAt = \Carbon\Carbon::parse($last);
        } catch (\Throwable) {
            return true;
        }

        $frequency = (string) Setting::get('backup_frequency', 'daily');

        return match ($frequency) {
            'weekly' => $lastAt->lte(now()->subDays(6)),
            'monthly' => $lastAt->lte(now()->subDays(27)),
            default => $lastAt->lte(now()->subHours(20)),
        };
    }

    /**
     * @return array{path: string, manifest: array<string, mixed>}
     */
    public function createBackup(): array
    {
        $stamp = now()->format('Ymd_His') . '_' . bin2hex(random_bytes(4));
        $path = $this->backupRoot() . DIRECTORY_SEPARATOR . $stamp;
        $staging = $path . '.partial';
        File::ensureDirectoryExists($staging);

        $databaseArtifact = $this->dumpDatabase($staging);
        $this->copyPublicStorage($staging . DIRECTORY_SEPARATOR . 'storage-public');

        $manifest = [
            'format_version' => 1,
            'type' => 'lms_db_storage',
            'created_at' => now()->toIso8601String(),
            'database_connection' => config('database.default'),
            'database_artifact' => $databaseArtifact,
            'includes' => ['database', 'storage_public'],
        ];
        File::put($staging . '/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        File::moveDirectory($staging, $path, true);

        Setting::set('backup_last_at', now()->toIso8601String(), 'string', 'Ultimul backup LMS');

        return ['path' => $path, 'manifest' => $manifest];
    }

    public function restore(string $path): void
    {
        $path = rtrim($path, DIRECTORY_SEPARATOR);
        $manifestFile = $path . '/manifest.json';
        if (! is_file($manifestFile)) {
            throw new \InvalidArgumentException('Backup invalid: lipsește manifest.json.');
        }

        $jsonPath = $path . '/database.json';
        $sqlitePath = $path . '/database.sqlite';
        if (is_file($jsonPath)) {
            $payload = json_decode((string) File::get($jsonPath), true);
            $tables = is_array($payload['tables'] ?? null) ? $payload['tables'] : [];
            $this->assertRestoreTables($tables);
            DB::transaction(fn () => $this->replaceTables($tables));
        } elseif (is_file($sqlitePath) && config('database.default') === 'sqlite') {
            $target = config('database.connections.sqlite.database');
            if (! is_string($target) || $target === ':memory:') {
                $this->restoreDatabaseJsonFromSqliteFile($sqlitePath);
            } else {
                DB::disconnect();
                copy($sqlitePath, $target);
            }
        } else {
            throw new \InvalidArgumentException('Backup invalid: lipsește dump-ul bazei.');
        }

        $publicCopy = $path . '/storage-public';
        if (is_dir($publicCopy)) {
            $this->restorePublicStorage($publicCopy);
        }
    }

    private function dumpDatabase(string $dir): string
    {
        $connection = (string) config('database.default');
        $driver = (string) config("database.connections.{$connection}.driver");

        if ($driver === 'sqlite') {
            $database = config("database.connections.{$connection}.database");
            if (is_string($database) && $database !== ':memory:' && is_file($database)) {
                copy($database, $dir . '/database.sqlite');
                $this->dumpAllTablesJson($dir . '/database.json');

                return 'database.sqlite';
            }
        }

        if ($driver === 'mysql' && $this->tryMysqlDump($dir . '/database.sql')) {
            $this->dumpAllTablesJson($dir . '/database.json');

            return 'database.sql';
        }

        $this->dumpAllTablesJson($dir . '/database.json');

        return 'database.json';
    }

    private function dumpAllTablesJson(string $file): void
    {
        $tables = $this->listDataTables();
        $payload = ['tables' => []];
        foreach ($tables as $table) {
            $payload['tables'][$table] = DB::table($table)->get()->map(fn ($row) => (array) $row)->all();
        }
        File::put($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function restoreDatabaseJsonFromSqliteFile(string $sqlitePath): void
    {
        $pdo = new \PDO('sqlite:' . $sqlitePath);
        $pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
        $names = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll();
        $tables = [];
        foreach ($names as $row) {
            $name = $row['name'] ?? null;
            if (! is_string($name) || in_array($name, $this->skippedTables(), true)) {
                continue;
            }
            $tables[$name] = $pdo->query('SELECT * FROM ' . $name)->fetchAll();
        }
        $this->assertRestoreTables($tables);
        DB::transaction(fn () => $this->replaceTables($tables));
    }

    /**
     * @param array<string, mixed> $tables
     */
    private function assertRestoreTables(array $tables): void
    {
        if ($tables === []) {
            throw new \InvalidArgumentException('Backup invalid: nu conține tabele.');
        }

        foreach ($tables as $table => $rows) {
            if (! is_string($table) || ! is_array($rows) || ! SchemaCache::hasTable($table) || in_array($table, $this->skippedTables(), true)) {
                continue;
            }
            $columns = Schema::getColumnListing($table);
            foreach ($rows as $index => $row) {
                if (! is_array($row)) {
                    throw new \InvalidArgumentException("Backup invalid: rând corupt în {$table}.");
                }
                $unknown = array_diff(array_keys($row), $columns);
                if ($unknown !== []) {
                    throw new \InvalidArgumentException(
                        "Backup invalid: coloane necunoscute în {$table}: " . implode(', ', $unknown)
                    );
                }
                unset($index);
            }
        }
    }

    /**
     * @param array<string, array<int, array<string, mixed>>> $tables
     */
    private function replaceTables(array $tables): void
    {
        $driver = DB::connection()->getDriverName();
        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF');
        } else {
            Schema::disableForeignKeyConstraints();
        }

        try {
            foreach (array_keys($tables) as $table) {
                if (! SchemaCache::hasTable($table) || in_array($table, $this->skippedTables(), true)) {
                    continue;
                }
                DB::table($table)->delete();
            }
            foreach ($tables as $table => $rows) {
                if (! SchemaCache::hasTable($table) || in_array($table, $this->skippedTables(), true) || ! is_array($rows)) {
                    continue;
                }
                foreach (array_chunk($rows, 100) as $chunk) {
                    if ($chunk === []) {
                        continue;
                    }
                    DB::table($table)->insert($chunk);
                }
            }
        } finally {
            if ($driver === 'sqlite') {
                DB::statement('PRAGMA foreign_keys = ON');
            } else {
                Schema::enableForeignKeyConstraints();
            }
        }
    }

    private function copyPublicStorage(string $destination): void
    {
        File::ensureDirectoryExists($destination);
        $root = Storage::disk('public')->path('');
        if (! is_dir($root)) {
            return;
        }
        File::copyDirectory($root, $destination);
    }

    private function restorePublicStorage(string $source): void
    {
        $root = Storage::disk('public')->path('');
        File::ensureDirectoryExists($root);
        File::copyDirectory($source, $root);
    }

    /**
     * @return list<string>
     */
    private function listDataTables(): array
    {
        return array_values(array_filter(
            Schema::getTableListing(),
            fn ($table) => ! in_array($table, $this->skippedTables(), true)
        ));
    }

    /**
     * @return list<string>
     */
    private function skippedTables(): array
    {
        return [
            'sqlite_sequence',
            'sessions',
            'cache',
            'cache_locks',
            'jobs',
            'job_batches',
            'failed_jobs',
        ];
    }

    private function tryMysqlDump(string $file): bool
    {
        $binary = trim((string) shell_exec('command -v mysqldump'));
        if ($binary === '') {
            return false;
        }

        $config = config('database.connections.mysql');
        $process = new Process([
            $binary,
            '--single-transaction',
            '--quick',
            '--routines',
            '-h', (string) ($config['host'] ?? '127.0.0.1'),
            '-P', (string) ($config['port'] ?? 3306),
            '-u', (string) ($config['username'] ?? 'root'),
            '-p' . (string) ($config['password'] ?? ''),
            (string) ($config['database'] ?? ''),
        ]);
        $process->setTimeout(300);
        $process->run();
        if (! $process->isSuccessful()) {
            return false;
        }
        File::put($file, $process->getOutput());

        return true;
    }
}
