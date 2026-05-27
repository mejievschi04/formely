<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->boolean('needs_manual_review')->default(false)->after('passed');
            $table->json('manual_review_scores')->nullable()->after('needs_manual_review'); // Store scores for each open_text question
            $table->timestamp('reviewed_at')->nullable()->after('manual_review_scores');
            $table->foreignId('reviewed_by')->nullable()->after('reviewed_at')->constrained('users')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->dropColumn(['needs_manual_review', 'manual_review_scores', 'reviewed_at', 'reviewed_by']);
        });
    }
};
