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
            // Make course_id nullable to allow exams for categories
            $table->foreignId('course_id')->nullable()->change();
            // Add category_id
            $table->foreignId('category_id')->nullable()->after('course_id')->constrained('categories')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->dropColumn('category_id');
            // Restore course_id as required (non-nullable)
            $table->foreignId('course_id')->nullable(false)->change();
        });
    }
};
