<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // First, add the attempt_number column if it doesn't exist
        if (!Schema::hasColumn('exam_results', 'attempt_number')) {
            Schema::table('exam_results', function (Blueprint $table) {
                $table->integer('attempt_number')->default(1)->after('user_id');
            });
        }
        
        // Check if the old unique constraint exists and drop it if it does
        // We need to use raw SQL because Laravel's dropUnique might fail if foreign keys use the index
        try {
            $indexExists = DB::select("
                SELECT COUNT(*) as count
                FROM information_schema.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'exam_results' 
                AND INDEX_NAME = 'exam_results_exam_id_user_id_unique'
            ");
            
            if (!empty($indexExists) && $indexExists[0]->count > 0) {
                // Drop the unique constraint using raw SQL
                // First, we need to check if there are foreign keys using this index
                $foreignKeys = DB::select("
                    SELECT CONSTRAINT_NAME 
                    FROM information_schema.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'exam_results' 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                    AND (COLUMN_NAME = 'exam_id' OR COLUMN_NAME = 'user_id')
                ");
                
                // If no foreign keys are using the index directly, we can drop it
                // Actually, the foreign keys are on the columns themselves, not the unique index
                // So we can safely drop the unique constraint
                DB::statement('ALTER TABLE exam_results DROP INDEX exam_results_exam_id_user_id_unique');
            }
        } catch (\Exception $e) {
            // Index might not exist or might have a different name, continue
        }
        
        // Add unique constraint on exam_id, user_id, attempt_number if it doesn't exist
        try {
            $newIndexExists = DB::select("
                SELECT COUNT(*) as count
                FROM information_schema.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'exam_results' 
                AND INDEX_NAME = 'exam_results_exam_id_user_id_attempt_number_unique'
            ");
            
            if (empty($newIndexExists) || $newIndexExists[0]->count == 0) {
                Schema::table('exam_results', function (Blueprint $table) {
                    $table->unique(['exam_id', 'user_id', 'attempt_number'], 'exam_results_exam_id_user_id_attempt_number_unique');
                });
            }
        } catch (\Exception $e) {
            // Index might already exist, continue
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            // Drop the new unique constraint
            $table->dropUnique(['exam_id', 'user_id', 'attempt_number']);
            // Drop attempt_number column
            $table->dropColumn('attempt_number');
        });
        
        // Restore the original unique constraint
        Schema::table('exam_results', function (Blueprint $table) {
            $table->unique(['exam_id', 'user_id']);
        });
    }
};
