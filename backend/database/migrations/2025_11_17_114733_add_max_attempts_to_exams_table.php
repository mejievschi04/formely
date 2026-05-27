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
        Schema::table('exams', function (Blueprint $table) {
            // Check if max_attempts column already exists (it might have been added in extend_exams_table_for_lms_pro)
            if (!Schema::hasColumn('exams', 'max_attempts')) {
                $table->integer('max_attempts')->nullable()->after('max_score');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn('max_attempts');
        });
    }
};
