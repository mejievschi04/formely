<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('exam_results', 'attempt_number')) {
            Schema::table('exam_results', function (Blueprint $table) {
                $table->integer('attempt_number')->default(1);
            });
        }

        // Pe Postgres o eroare abandonează tranzacția migrării, deci verificăm în loc de try/catch.
        // Formely a scos deja indexul vechi (2026_05_27_131500_ensure_exam_results_attempt_number_column).
        if (Schema::hasIndex('exam_results', ['exam_id', 'user_id'], 'unique')) {
            Schema::table('exam_results', function (Blueprint $table) {
                $table->dropUnique(['exam_id', 'user_id']);
            });
        }

        if (! Schema::hasIndex('exam_results', ['exam_id', 'user_id', 'attempt_number'], 'unique')) {
            Schema::table('exam_results', function (Blueprint $table) {
                $table->unique(['exam_id', 'user_id', 'attempt_number'], 'exam_results_exam_user_attempt_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropUnique('exam_results_exam_user_attempt_unique');
            $table->unique(['exam_id', 'user_id']);
            $table->dropColumn('attempt_number');
        });
    }
};
