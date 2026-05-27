<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migrarea 2026_02_23_140001 extinde ENUM doar pe MySQL. Pe PostgreSQL, Laravel creează
 * un CHECK pe coloana `type`; fără single_choice, PUT /admin/questions/{id} eșuează cu 500.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql' || !Schema::hasTable('questions')) {
            return;
        }

        $rows = DB::select("
            SELECT c.conname, pg_get_constraintdef(c.oid) AS def
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'questions' AND c.contype = 'c'
        ");

        foreach ($rows as $row) {
            $def = (string) ($row->def ?? '');
            $looksLikeTypeEnum = str_contains($def, 'type')
                && (str_contains($def, 'ANY') || preg_match('/\bIN\s*\(/i', $def) === 1);
            if (!$looksLikeTypeEnum) {
                continue;
            }
            $name = str_replace('"', '""', (string) $row->conname);
            DB::statement('ALTER TABLE questions DROP CONSTRAINT IF EXISTS "' . $name . '"');
        }

        $exists = DB::selectOne("
            SELECT 1 AS ok
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'questions' AND c.conname = 'questions_type_allowed'
        ");
        if ($exists) {
            return;
        }

        DB::statement("ALTER TABLE questions ADD CONSTRAINT questions_type_allowed CHECK (type IN (
            'single_choice',
            'multiple_choice',
            'true_false',
            'short_answer',
            'essay',
            'fill_in_blank',
            'matching',
            'ordering'
        ))");
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql' || !Schema::hasTable('questions')) {
            return;
        }
        DB::statement('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_allowed');
    }
};
