<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add manual verification support to tests and test_results.
 * - tests: requires_manual_verification flag (explicit opt-in)
 * - test_results: needs_manual_review, manual_review_scores, reviewed_by for pending manual grading
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tests') && !Schema::hasColumn('tests', 'requires_manual_verification')) {
            Schema::table('tests', function (Blueprint $table) {
                $table->boolean('requires_manual_verification')->default(false)->after('allow_review');
            });
        }

        if (Schema::hasTable('test_results')) {
            Schema::table('test_results', function (Blueprint $table) {
                if (!Schema::hasColumn('test_results', 'needs_manual_review')) {
                    $table->boolean('needs_manual_review')->default(false);
                }
                if (!Schema::hasColumn('test_results', 'manual_review_scores')) {
                    $table->json('manual_review_scores')->nullable();
                }
                if (!Schema::hasColumn('test_results', 'reviewed_by')) {
                    $table->foreignId('reviewed_by')->nullable()->constrained('users')->onDelete('set null');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('tests') && Schema::hasColumn('tests', 'requires_manual_verification')) {
            Schema::table('tests', function (Blueprint $table) {
                $table->dropColumn('requires_manual_verification');
            });
        }

        if (Schema::hasTable('test_results')) {
            Schema::table('test_results', function (Blueprint $table) {
                if (Schema::hasColumn('test_results', 'reviewed_by')) {
                    $table->dropForeign(['reviewed_by']);
                }
                $columns = [];
                if (Schema::hasColumn('test_results', 'needs_manual_review')) $columns[] = 'needs_manual_review';
                if (Schema::hasColumn('test_results', 'manual_review_scores')) $columns[] = 'manual_review_scores';
                if (Schema::hasColumn('test_results', 'reviewed_by')) $columns[] = 'reviewed_by';
                if (!empty($columns)) {
                    $table->dropColumn($columns);
                }
            });
        }
    }
};
