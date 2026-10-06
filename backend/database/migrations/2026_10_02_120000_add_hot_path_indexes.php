<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Indexuri pentru interogări foarte dese:
 * - notifications: badge-ul de necitite (polling la 30 s, toți utilizatorii) filtrează după user_id + read_at;
 * - course_user: cursurile unui utilizator (unique-ul existent începe cu course_id, deci nu acoperă user_id).
 */
return new class extends Migration
{
    private const INDEXES = [
        ['notifications', 'notifications_user_id_read_at_index', ['user_id', 'read_at']],
        ['course_user', 'course_user_user_id_index', ['user_id']],
    ];

    public function up(): void
    {
        $isPgsql = Schema::getConnection()->getDriverName() === 'pgsql';

        foreach (self::INDEXES as [$table, $name, $columns]) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            if ($isPgsql) {
                DB::statement(sprintf('CREATE INDEX IF NOT EXISTS %s ON %s (%s)', $name, $table, implode(', ', $columns)));
                continue;
            }

            if (! Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        $isPgsql = Schema::getConnection()->getDriverName() === 'pgsql';

        foreach (self::INDEXES as [$table, $name]) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            if ($isPgsql) {
                DB::statement(sprintf('DROP INDEX IF EXISTS %s', $name));
                continue;
            }

            if (Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
            }
        }
    }
};
