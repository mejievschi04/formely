<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('activity_logs')) {
            Schema::table('activity_logs', function (Blueprint $table) {
                $table->index(['action', 'created_at'], 'activity_logs_action_created_at_idx');
                $table->index(['model_type', 'model_id', 'created_at'], 'activity_logs_model_created_at_idx');
            });
        }

        if (Schema::hasTable('test_results')) {
            Schema::table('test_results', function (Blueprint $table) {
                $table->index(['completed_at', 'passed'], 'test_results_completed_passed_idx');
                $table->index(['test_id', 'completed_at'], 'test_results_test_completed_idx');
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table) {
                $table->index(['question_bank_id'], 'questions_question_bank_id_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('activity_logs')) {
            Schema::table('activity_logs', function (Blueprint $table) {
                $table->dropIndex('activity_logs_action_created_at_idx');
                $table->dropIndex('activity_logs_model_created_at_idx');
            });
        }

        if (Schema::hasTable('test_results')) {
            Schema::table('test_results', function (Blueprint $table) {
                $table->dropIndex('test_results_completed_passed_idx');
                $table->dropIndex('test_results_test_completed_idx');
            });
        }

        if (Schema::hasTable('questions')) {
            Schema::table('questions', function (Blueprint $table) {
                $table->dropIndex('questions_question_bank_id_idx');
            });
        }
    }
};

