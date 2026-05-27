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
        // Determine which table name to use
        $tableName = Schema::hasTable('test_results') ? 'test_results' : 
                    (Schema::hasTable('exam_results') ? 'exam_results' : null);
        
        if (!$tableName) {
            // Neither table exists, skip this migration
            return;
        }
        
        Schema::table($tableName, function (Blueprint $table) use ($tableName) {
            // Add max_score if it doesn't exist (for compatibility with TestResult model)
            if (!Schema::hasColumn($tableName, 'max_score')) {
                $table->integer('max_score')->nullable()->after('score');
            }
            
            // Add status if it doesn't exist
            if (!Schema::hasColumn($tableName, 'status')) {
                $table->string('status')->default('completed')->after('passed');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Determine which table name to use
        $tableName = Schema::hasTable('test_results') ? 'test_results' : 
                    (Schema::hasTable('exam_results') ? 'exam_results' : null);
        
        if (!$tableName) {
            return;
        }
        
        Schema::table($tableName, function (Blueprint $table) use ($tableName) {
            if (Schema::hasColumn($tableName, 'max_score')) {
                $table->dropColumn('max_score');
            }
            if (Schema::hasColumn($tableName, 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
