<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * exams.status trebuie să accepte archived (UI admin).
     */
    public function up(): void
    {
        if (! Schema::hasTable('exams') || ! Schema::hasColumn('exams', 'status')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE exams MODIFY COLUMN status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement("ALTER TABLE exams ALTER COLUMN status TYPE VARCHAR(20) USING status::text");
            DB::statement("ALTER TABLE exams ALTER COLUMN status SET DEFAULT 'draft'");
            DB::statement('ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check');
            DB::statement("ALTER TABLE exams ADD CONSTRAINT exams_status_check CHECK (status IN ('draft', 'published', 'archived'))");
        } else {
            Schema::table('exams', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('exams') || ! Schema::hasColumn('exams', 'status')) {
            return;
        }

        DB::table('exams')->where('status', 'archived')->update(['status' => 'draft']);

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE exams MODIFY COLUMN status ENUM('draft', 'published') NOT NULL DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check');
            DB::statement("ALTER TABLE exams ADD CONSTRAINT exams_status_check CHECK (status IN ('draft', 'published'))");
        }
    }
};
