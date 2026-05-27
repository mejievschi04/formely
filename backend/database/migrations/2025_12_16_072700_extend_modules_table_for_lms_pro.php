<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            // Status and locking
            if (!Schema::hasColumn('modules', 'status')) {
                $table->enum('status', ['draft', 'published'])->default('draft')->after('order');
            }
            if (!Schema::hasColumn('modules', 'is_locked')) {
                $table->boolean('is_locked')->default(false)->after('status');
            }
            
            // Unlock conditions
            if (!Schema::hasColumn('modules', 'unlock_after_module_id')) {
                $table->integer('unlock_after_module_id')->nullable()->after('is_locked');
            }
            if (!Schema::hasColumn('modules', 'unlock_after_lesson_id')) {
                $table->integer('unlock_after_lesson_id')->nullable()->after('unlock_after_module_id');
            }
            
            // Analytics
            if (!Schema::hasColumn('modules', 'estimated_duration_minutes')) {
                $table->integer('estimated_duration_minutes')->nullable()->after('unlock_after_lesson_id');
            }
            if (!Schema::hasColumn('modules', 'completion_percentage')) {
                $table->decimal('completion_percentage', 5, 2)->default(0)->after('estimated_duration_minutes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            $columns = [
                'status',
                'is_locked',
                'unlock_after_module_id',
                'unlock_after_lesson_id',
                'estimated_duration_minutes',
                'completion_percentage',
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('modules', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

