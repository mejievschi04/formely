<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            if (!Schema::hasColumn('test_results', 'correct_answers_count')) {
                $table->unsignedInteger('correct_answers_count')->nullable()->after('max_score');
            }
            if (!Schema::hasColumn('test_results', 'total_questions')) {
                $table->unsignedInteger('total_questions')->nullable()->after('correct_answers_count');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            if (Schema::hasColumn('test_results', 'correct_answers_count')) {
                $table->dropColumn('correct_answers_count');
            }
            if (Schema::hasColumn('test_results', 'total_questions')) {
                $table->dropColumn('total_questions');
            }
        });
    }
};
