<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('test_results') || Schema::hasColumn('test_results', 'course_id')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            $table->foreignId('course_id')
                ->nullable()
                ->after('test_id')
                ->constrained('courses')
                ->nullOnDelete();

            $table->index(['user_id', 'course_id', 'completed_at'], 'test_results_user_course_completed_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('test_results') || !Schema::hasColumn('test_results', 'course_id')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            $table->dropIndex('test_results_user_course_completed_idx');
            $table->dropConstrainedForeignId('course_id');
        });
    }
};
