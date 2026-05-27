<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Create lessons table if it doesn't exist
        if (!Schema::hasTable('lessons')) {
            Schema::create('lessons', function (Blueprint $table) {
                $table->id();
                $table->foreignId('course_id')->constrained('courses')->onDelete('cascade');
                $table->string('title');
                $table->text('content')->nullable();
                $table->text('video_url')->nullable();
                $table->text('resources')->nullable();
                $table->integer('duration_minutes')->nullable();
                $table->integer('order')->default(0);
                $table->boolean('is_preview')->default(false);
                $table->timestamps();
            });
        }

        Schema::table('lessons', function (Blueprint $table) {
            // Module relationship (only if column doesn't exist)
            if (!Schema::hasColumn('lessons', 'module_id')) {
                $table->foreignId('module_id')->nullable()->after('course_id')->constrained('modules')->onDelete('cascade');
            }
            
            // Lesson type and status
            if (!Schema::hasColumn('lessons', 'type')) {
                $table->enum('type', ['video', 'text', 'live', 'resource'])->default('video')->after('module_id');
            }
            if (!Schema::hasColumn('lessons', 'status')) {
                $table->enum('status', ['draft', 'published'])->default('draft')->after('type');
            }
            
            // Preview and locking
            if (!Schema::hasColumn('lessons', 'is_locked')) {
                $table->boolean('is_locked')->default(false)->after('is_preview');
            }
            if (!Schema::hasColumn('lessons', 'unlock_after_lesson_id')) {
                $table->integer('unlock_after_lesson_id')->nullable()->after('is_locked');
            }
            
            // Content - make nullable if not already
            if (Schema::hasColumn('lessons', 'content')) {
                $table->text('content')->nullable()->change();
            }
            
            // Attachments
            if (!Schema::hasColumn('lessons', 'attachments')) {
                $table->json('attachments')->nullable()->after('resources');
            }
            
            // Progress tracking
            if (!Schema::hasColumn('lessons', 'views_count')) {
                $table->integer('views_count')->default(0)->after('attachments');
            }
            if (!Schema::hasColumn('lessons', 'completions_count')) {
                $table->integer('completions_count')->default(0)->after('views_count');
            }
            if (!Schema::hasColumn('lessons', 'average_completion_time_minutes')) {
                $table->decimal('average_completion_time_minutes', 8, 2)->nullable()->after('completions_count');
            }
            
            // Indexes (only if columns exist)
            if (Schema::hasColumn('lessons', 'module_id')) {
                $table->index(['module_id', 'order']);
            }
            $table->index(['course_id', 'order']);
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('lessons')) {
            return;
        }

        Schema::table('lessons', function (Blueprint $table) {
            $columns = [
                'module_id',
                'type',
                'status',
                'is_locked',
                'unlock_after_lesson_id',
                'attachments',
                'views_count',
                'completions_count',
                'average_completion_time_minutes',
            ];
            
            // Drop foreign key if exists
            if (Schema::hasColumn('lessons', 'module_id')) {
                try {
                    $table->dropForeign(['module_id']);
                } catch (\Exception $e) {
                    // Foreign key might not exist
                }
            }
            
            // Drop indexes if they exist
            try {
                $table->dropIndex(['module_id', 'order']);
            } catch (\Exception $e) {
                // Index might not exist
            }
            
            try {
                $table->dropIndex(['course_id', 'order']);
            } catch (\Exception $e) {
                // Index might not exist
            }
            
            // Drop columns
            foreach ($columns as $column) {
                if (Schema::hasColumn('lessons', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

