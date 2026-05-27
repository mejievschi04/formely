<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Convert archived tests to draft so the stored data matches the
     * supported status set for tests.
     */
    public function up(): void
    {
        DB::table('tests')
            ->where('status', 'archived')
            ->update(['status' => 'draft']);

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE tests MODIFY COLUMN status ENUM('draft', 'published') DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_status_check');
            DB::statement("ALTER TABLE tests ADD CONSTRAINT tests_status_check CHECK (status IN ('draft', 'published'))");
        } else {
            Schema::table('tests', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });
        }
    }

    /**
     * Restore the previous schema shape on rollback.
     */
    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE tests MODIFY COLUMN status ENUM('draft', 'published', 'archived') DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_status_check');
            DB::statement("ALTER TABLE tests ADD CONSTRAINT tests_status_check CHECK (status IN ('draft', 'published', 'archived'))");
        } else {
            Schema::table('tests', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });
        }
    }
};
