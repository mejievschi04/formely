<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('courses') || !Schema::hasColumn('courses', 'category_id')) {
            return;
        }

        // Drop FK only if it exists (important on Postgres because a failed DDL inside
        // a migration transaction will abort the whole transaction, even if caught).
        $fkName = 'courses_category_id_foreign';
        $fkExists = false;
        try {
            $row = DB::selectOne(
                "select conname
                 from pg_constraint c
                 join pg_class t on t.oid = c.conrelid
                 join pg_namespace n on n.oid = t.relnamespace
                 where t.relname = 'courses'
                   and n.nspname = current_schema()
                   and c.conname = ?",
                [$fkName]
            );
            $fkExists = (bool)($row?->conname ?? null);
        } catch (\Throwable $e) {
            // Non-pgsql connection or insufficient permissions; fall back to no-op.
            $fkExists = false;
        }

        if ($fkExists) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropForeign(['category_id']);
            });
        }

        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn('category_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('courses') || Schema::hasColumn('courses', 'category_id')) {
            return;
        }

        Schema::table('courses', function (Blueprint $table) {
            if (Schema::hasTable('categories')) {
                $table->foreignId('category_id')->nullable()->after('teacher_id')->constrained('categories')->onDelete('set null');
            } else {
                $table->unsignedBigInteger('category_id')->nullable()->after('teacher_id');
            }
        });
    }
};
