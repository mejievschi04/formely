<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Assessment engine: add single_choice question type (instructiuni.md).
     */
    public function up(): void
    {
        $driver = DB::getDriverName();
        // MySQL: extend enum. SQLite/PostgreSQL: type is string, single_choice is accepted without schema change.
        if ($driver === 'mysql' && \Illuminate\Support\Facades\Schema::hasTable('questions')) {
            DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM(
                'single_choice',
                'multiple_choice',
                'true_false',
                'short_answer',
                'essay',
                'fill_in_blank',
                'matching',
                'ordering'
            ) NOT NULL DEFAULT 'multiple_choice'");
        }
        // SQLite and others: enum is not native; type is stored as string, so no migration needed for SQLite
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql' && Schema::hasTable('questions')) {
            DB::statement("UPDATE questions SET type = 'multiple_choice' WHERE type = 'single_choice'");
            DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM(
                'multiple_choice',
                'true_false',
                'short_answer',
                'essay',
                'fill_in_blank',
                'matching',
                'ordering'
            ) NOT NULL DEFAULT 'multiple_choice'");
        }
    }
};
