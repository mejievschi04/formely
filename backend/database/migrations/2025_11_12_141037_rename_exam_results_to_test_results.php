<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Rename exam_results to test_results and update foreign keys
     */
    public function up(): void
    {
        if (Schema::hasTable('exam_results')) {
            // Check if already renamed
            if (Schema::hasTable('test_results')) {
                // Table already renamed, just update the column and foreign key if needed
                if (Schema::hasColumn('test_results', 'exam_id') && !Schema::hasColumn('test_results', 'test_id')) {
                    // Rename column
                    DB::statement('ALTER TABLE test_results CHANGE exam_id test_id BIGINT UNSIGNED');
                    
                    // Add new foreign key if tests table exists
                    if (Schema::hasTable('tests')) {
                        try {
                            Schema::table('test_results', function (Blueprint $table) {
                                $table->foreign('test_id')->references('id')->on('tests')->onDelete('cascade');
                            });
                        } catch (\Exception $e) {
                            // Foreign key might already exist
                        }
                    }
                }
                return;
            }
            
            Schema::rename('exam_results', 'test_results');
            
            // Check if column needs to be renamed
            if (Schema::hasColumn('test_results', 'exam_id')) {
                // Get foreign key constraint name first
                $foreignKeys = DB::select("
                    SELECT CONSTRAINT_NAME 
                    FROM information_schema.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'test_results' 
                    AND COLUMN_NAME = 'exam_id' 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                ");
                
                // Drop foreign key if it exists
                foreach ($foreignKeys as $fk) {
                    try {
                        DB::statement("ALTER TABLE test_results DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
                    } catch (\Exception $e) {
                        // Ignore if doesn't exist
                    }
                }
                
                // Rename column
                DB::statement('ALTER TABLE test_results CHANGE exam_id test_id BIGINT UNSIGNED');
                
                // Add new foreign key if tests table exists
                if (Schema::hasTable('tests')) {
                    try {
                        Schema::table('test_results', function (Blueprint $table) {
                            $table->foreign('test_id')->references('id')->on('tests')->onDelete('cascade');
                        });
                    } catch (\Exception $e) {
                        // Foreign key might already exist
                    }
                }
            }
        } elseif (Schema::hasTable('test_results')) {
            // Table already exists with new name, just ensure column and foreign key are correct
            if (Schema::hasColumn('test_results', 'exam_id') && !Schema::hasColumn('test_results', 'test_id')) {
                // Get foreign key constraint name
                $foreignKeys = DB::select("
                    SELECT CONSTRAINT_NAME 
                    FROM information_schema.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'test_results' 
                    AND COLUMN_NAME = 'exam_id' 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                ");
                
                // Drop foreign key if it exists
                foreach ($foreignKeys as $fk) {
                    try {
                        DB::statement("ALTER TABLE test_results DROP FOREIGN KEY `{$fk->CONSTRAINT_NAME}`");
                    } catch (\Exception $e) {
                        // Ignore if doesn't exist
                    }
                }
                
                // Rename column
                DB::statement('ALTER TABLE test_results CHANGE exam_id test_id BIGINT UNSIGNED');
            }
            
            // Add foreign key if tests table exists and column exists
            if (Schema::hasTable('tests') && Schema::hasColumn('test_results', 'test_id')) {
                try {
                    Schema::table('test_results', function (Blueprint $table) {
                        $table->foreign('test_id')->references('id')->on('tests')->onDelete('cascade');
                    });
                } catch (\Exception $e) {
                    // Foreign key might already exist
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('test_results')) {
            Schema::table('test_results', function (Blueprint $table) {
                try {
                    $table->dropForeign(['test_id']);
                } catch (\Exception $e) {
                    // Foreign key might not exist
                }
                
                if (Schema::hasColumn('test_results', 'test_id')) {
                    $table->renameColumn('test_id', 'exam_id');
                }
            });
            
            Schema::rename('test_results', 'exam_results');
        }
    }
};

