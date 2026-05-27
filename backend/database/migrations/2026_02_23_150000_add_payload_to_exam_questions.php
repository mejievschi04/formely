<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Assessment engine: matching/ordering store structured payload (instructiuni.md).
     */
    public function up(): void
    {
        if (!Schema::hasTable('exam_questions')) {
            return;
        }
        if (Schema::hasColumn('exam_questions', 'payload')) {
            return;
        }
        Schema::table('exam_questions', function (Blueprint $table) {
            $table->json('payload')->nullable()->after('points');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('exam_questions') && Schema::hasColumn('exam_questions', 'payload')) {
            Schema::table('exam_questions', function (Blueprint $table) {
                $table->dropColumn('payload');
            });
        }
    }
};
