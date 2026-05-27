<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            // Module and lesson relationships
            if (!Schema::hasColumn('exams', 'module_id')) {
                // Add module_id without foreign key constraint initially (modules table is created later)
                if (Schema::hasTable('modules')) {
                    $table->foreignId('module_id')->nullable()->after('course_id')->constrained('modules')->onDelete('cascade');
                } else {
                    // Just add the column without foreign key constraint for now
                    $table->unsignedBigInteger('module_id')->nullable()->after('course_id');
                }
            }
            // Only add lesson_id if lessons table exists
            if (Schema::hasTable('lessons') && !Schema::hasColumn('exams', 'lesson_id')) {
                $table->foreignId('lesson_id')->nullable()->after('module_id')->constrained('lessons')->onDelete('cascade');
            }
            
            // Exam settings
            if (!Schema::hasColumn('exams', 'description')) {
                $table->text('description')->nullable()->after('title');
            }
            if (!Schema::hasColumn('exams', 'status')) {
                $table->enum('status', ['draft', 'published'])->default('draft')->after('description');
            }
            if (!Schema::hasColumn('exams', 'passing_score')) {
                $table->integer('passing_score')->default(70)->after('max_score');
            }
            if (!Schema::hasColumn('exams', 'time_limit_minutes')) {
                $table->integer('time_limit_minutes')->nullable()->after('passing_score');
            }
            // Add max_attempts if it doesn't exist (it might be added in a later migration)
            if (!Schema::hasColumn('exams', 'max_attempts')) {
                $table->integer('max_attempts')->nullable()->after('time_limit_minutes');
            }
            if (!Schema::hasColumn('exams', 'is_required')) {
                // Add is_required after max_attempts (which we just added if it didn't exist)
                $table->boolean('is_required')->default(false)->after('max_attempts');
            }
            if (!Schema::hasColumn('exams', 'unlock_after_completion')) {
                $table->boolean('unlock_after_completion')->default(false)->after('is_required');
            }
            if (!Schema::hasColumn('exams', 'unlock_target_id')) {
                $table->integer('unlock_target_id')->nullable()->after('unlock_after_completion');
            }
            if (!Schema::hasColumn('exams', 'unlock_target_type')) {
                $table->enum('unlock_target_type', ['module', 'lesson'])->nullable()->after('unlock_target_id');
            }
            
            // Question types
            if (!Schema::hasColumn('exams', 'question_types')) {
                $table->json('question_types')->nullable()->after('unlock_target_type');
            }
            
            // Analytics
            if (!Schema::hasColumn('exams', 'attempts_count')) {
                $table->integer('attempts_count')->default(0)->after('question_types');
            }
            if (!Schema::hasColumn('exams', 'passes_count')) {
                $table->integer('passes_count')->default(0)->after('attempts_count');
            }
            if (!Schema::hasColumn('exams', 'average_score')) {
                $table->decimal('average_score', 5, 2)->nullable()->after('passes_count');
            }
            
            // Indexes
            if (Schema::hasColumn('exams', 'module_id')) {
                $table->index(['module_id']);
            }
            if (Schema::hasColumn('exams', 'lesson_id')) {
                $table->index(['lesson_id']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            // Drop foreign keys if they exist
            if (Schema::hasColumn('exams', 'module_id')) {
                try {
                    $table->dropForeign(['module_id']);
                } catch (\Exception $e) {
                    // Foreign key might not exist
                }
            }
            if (Schema::hasColumn('exams', 'lesson_id')) {
                try {
                    $table->dropForeign(['lesson_id']);
                } catch (\Exception $e) {
                    // Foreign key might not exist
                }
            }
            
            // Drop indexes
            try {
                $table->dropIndex(['module_id']);
            } catch (\Exception $e) {
                // Index might not exist
            }
            try {
                $table->dropIndex(['lesson_id']);
            } catch (\Exception $e) {
                // Index might not exist
            }
            
            // Drop columns
            $columns = [
                'module_id',
                'lesson_id',
                'description',
                'status',
                'passing_score',
                'time_limit_minutes',
                'is_required',
                'unlock_after_completion',
                'unlock_target_id',
                'unlock_target_type',
                'question_types',
                'attempts_count',
                'passes_count',
                'average_score',
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('exams', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

