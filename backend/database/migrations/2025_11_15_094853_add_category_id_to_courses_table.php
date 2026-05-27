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
        Schema::table('courses', function (Blueprint $table) {
            // Check if category_id column already exists (it might have been added in extend_courses_table_for_lms_pro)
            if (!Schema::hasColumn('courses', 'category_id')) {
                // Add category_id with foreign key if categories table exists
                if (Schema::hasTable('categories')) {
                    $table->foreignId('category_id')->nullable()->after('teacher_id')->constrained('categories')->onDelete('set null');
                } else {
                    // Just add the column without foreign key constraint for now
                    $table->unsignedBigInteger('category_id')->nullable()->after('teacher_id');
                }
            } else {
                // Column exists, but might not have foreign key constraint - add it if categories table exists
                if (Schema::hasTable('categories')) {
                    try {
                        // Check if foreign key already exists
                        $foreignKeys = DB::select("
                            SELECT CONSTRAINT_NAME 
                            FROM information_schema.KEY_COLUMN_USAGE 
                            WHERE TABLE_SCHEMA = DATABASE() 
                            AND TABLE_NAME = 'courses' 
                            AND COLUMN_NAME = 'category_id' 
                            AND REFERENCED_TABLE_NAME IS NOT NULL
                        ");
                        
                        if (empty($foreignKeys)) {
                            // Add foreign key constraint
                            $table->foreign('category_id')->references('id')->on('categories')->onDelete('set null');
                        }
                    } catch (\Exception $e) {
                        // Foreign key might already exist or there's another issue
                    }
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->dropColumn('category_id');
        });
    }
};
