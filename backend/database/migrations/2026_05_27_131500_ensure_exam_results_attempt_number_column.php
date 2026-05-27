<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * PostgreSQL / DB-uri unde migrarea 114743 nu a rulat complet (index MySQL-only).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('exam_results')) {
            return;
        }

        if (! Schema::hasColumn('exam_results', 'attempt_number')) {
            Schema::table('exam_results', function (Blueprint $table) {
                $table->integer('attempt_number')->default(1);
            });

            DB::table('exam_results')->update(['attempt_number' => 1]);
        }

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE exam_results DROP CONSTRAINT IF EXISTS exam_results_exam_id_user_id_unique');
        } elseif ($driver === 'mysql') {
            try {
                DB::statement('ALTER TABLE exam_results DROP INDEX exam_results_exam_id_user_id_unique');
            } catch (\Throwable) {
                // Index may not exist
            }
        }

        $indexName = 'exam_results_exam_id_user_id_attempt_number_unique';
        if (! $this->indexExists('exam_results', $indexName)) {
            Schema::table('exam_results', function (Blueprint $table) use ($indexName) {
                $table->unique(['exam_id', 'user_id', 'attempt_number'], $indexName);
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('exam_results') || ! Schema::hasColumn('exam_results', 'attempt_number')) {
            return;
        }

        $indexName = 'exam_results_exam_id_user_id_attempt_number_unique';
        if ($this->indexExists('exam_results', $indexName)) {
            Schema::table('exam_results', function (Blueprint $table) use ($indexName) {
                $table->dropUnique($indexName);
            });
        }

        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropColumn('attempt_number');
        });
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            $row = DB::selectOne(
                'SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ? LIMIT 1',
                [$table, $indexName]
            );

            return $row !== null;
        }

        if ($driver === 'mysql') {
            $database = Schema::getConnection()->getDatabaseName();
            $row = DB::selectOne(
                'SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
                [$database, $table, $indexName]
            );

            return $row !== null;
        }

        return false;
    }
};
