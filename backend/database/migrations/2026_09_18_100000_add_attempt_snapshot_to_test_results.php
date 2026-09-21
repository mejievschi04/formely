<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            if (! Schema::hasColumn('test_results', 'expires_at')) {
                $table->timestamp('expires_at')->nullable()->after('started_at');
            }
            if (! Schema::hasColumn('test_results', 'question_snapshot')) {
                $table->json('question_snapshot')->nullable();
            }
            if (! Schema::hasColumn('test_results', 'passing_score_applied')) {
                $table->unsignedTinyInteger('passing_score_applied')->nullable();
            }
            if (! Schema::hasColumn('test_results', 'attempt_token')) {
                $table->uuid('attempt_token')->nullable()->unique();
            }
            if (! Schema::hasColumn('test_results', 'attempt_scope')) {
                $table->string('attempt_scope', 64)->nullable()->unique();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            foreach (['expires_at', 'question_snapshot', 'passing_score_applied', 'attempt_token', 'attempt_scope'] as $column) {
                if (Schema::hasColumn('test_results', $column)) {
                    if (in_array($column, ['attempt_token', 'attempt_scope'], true)) {
                        $table->dropUnique([$column]);
                    }
                    $table->dropColumn($column);
                }
            }
        });
    }
};
