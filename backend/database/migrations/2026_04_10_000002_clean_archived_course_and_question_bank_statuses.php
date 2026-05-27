<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('courses')->where('status', 'archived')->update(['status' => 'draft']);
        DB::table('question_banks')->where('status', 'archived')->update(['status' => 'draft']);

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE courses MODIFY COLUMN status ENUM('draft', 'published') DEFAULT 'draft'");
            DB::statement("ALTER TABLE question_banks MODIFY COLUMN status ENUM('draft', 'published') DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_status_check');
            DB::statement("ALTER TABLE courses ADD CONSTRAINT courses_status_check CHECK (status IN ('draft', 'published'))");

            DB::statement('ALTER TABLE question_banks DROP CONSTRAINT IF EXISTS question_banks_status_check');
            DB::statement("ALTER TABLE question_banks ADD CONSTRAINT question_banks_status_check CHECK (status IN ('draft', 'published'))");
        } else {
            Schema::table('courses', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });

            Schema::table('question_banks', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE courses MODIFY COLUMN status ENUM('draft', 'published', 'archived') DEFAULT 'draft'");
            DB::statement("ALTER TABLE question_banks MODIFY COLUMN status ENUM('draft', 'published', 'archived') DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_status_check');
            DB::statement("ALTER TABLE courses ADD CONSTRAINT courses_status_check CHECK (status IN ('draft', 'published', 'archived'))");

            DB::statement('ALTER TABLE question_banks DROP CONSTRAINT IF EXISTS question_banks_status_check');
            DB::statement("ALTER TABLE question_banks ADD CONSTRAINT question_banks_status_check CHECK (status IN ('draft', 'published', 'archived'))");
        } else {
            Schema::table('courses', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });

            Schema::table('question_banks', function (Blueprint $table) {
                $table->string('status', 20)->default('draft')->change();
            });
        }
    }
};
