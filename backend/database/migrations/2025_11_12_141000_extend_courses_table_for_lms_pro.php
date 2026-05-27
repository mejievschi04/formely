<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            // Status and access
            if (!Schema::hasColumn('courses', 'status')) {
                $table->enum('status', ['draft', 'published', 'archived'])->default('draft')->after('reward_points');
            }
            if (!Schema::hasColumn('courses', 'access_type')) {
                $table->enum('access_type', ['free', 'paid', 'subscription'])->default('free')->after('status');
            }
            if (!Schema::hasColumn('courses', 'price')) {
                $table->decimal('price', 10, 2)->nullable()->after('access_type');
            }
            if (!Schema::hasColumn('courses', 'currency')) {
                $table->string('currency', 3)->default('RON')->after('price');
            }
            
            // Level and category
            if (!Schema::hasColumn('courses', 'level')) {
                $table->enum('level', ['beginner', 'intermediate', 'advanced'])->nullable()->after('currency');
            }
            if (!Schema::hasColumn('courses', 'category_id')) {
                // Add category_id column first (without foreign key if categories table doesn't exist)
                if (Schema::hasTable('categories')) {
                    $table->foreignId('category_id')->nullable()->after('level')->constrained('categories')->onDelete('set null');
                } else {
                    // Just add the column without foreign key constraint for now
                    $table->unsignedBigInteger('category_id')->nullable()->after('level');
                }
            }
            
            // Metadata
            if (!Schema::hasColumn('courses', 'short_description')) {
                $table->text('short_description')->nullable()->after('description');
            }
            if (!Schema::hasColumn('courses', 'objectives')) {
                $table->json('objectives')->nullable()->after('short_description');
            }
            if (!Schema::hasColumn('courses', 'requirements')) {
                $table->json('requirements')->nullable()->after('objectives');
            }
            if (!Schema::hasColumn('courses', 'estimated_duration_hours')) {
                $table->integer('estimated_duration_hours')->nullable()->after('requirements');
            }
            
            // Progression rules
            if (!Schema::hasColumn('courses', 'sequential_unlock')) {
                $table->boolean('sequential_unlock')->default(true)->after('estimated_duration_hours');
            }
            if (!Schema::hasColumn('courses', 'min_completion_percentage')) {
                $table->integer('min_completion_percentage')->default(0)->after('sequential_unlock');
            }
            
            // Analytics
            if (!Schema::hasColumn('courses', 'total_enrollments')) {
                $table->integer('total_enrollments')->default(0)->after('min_completion_percentage');
            }
            if (!Schema::hasColumn('courses', 'total_revenue')) {
                $table->decimal('total_revenue', 12, 2)->default(0)->after('total_enrollments');
            }
            if (!Schema::hasColumn('courses', 'average_rating')) {
                $table->decimal('average_rating', 3, 2)->nullable()->after('total_revenue');
            }
            if (!Schema::hasColumn('courses', 'rating_count')) {
                $table->integer('rating_count')->default(0)->after('average_rating');
            }
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            if (Schema::hasColumn('courses', 'category_id')) {
                try {
                    $table->dropForeign(['category_id']);
                } catch (\Exception $e) {
                    // Foreign key might not exist
                }
            }
            
            $columns = [
                'status',
                'access_type',
                'price',
                'currency',
                'level',
                'category_id',
                'short_description',
                'objectives',
                'requirements',
                'estimated_duration_hours',
                'sequential_unlock',
                'min_completion_percentage',
                'total_enrollments',
                'total_revenue',
                'average_rating',
                'rating_count',
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('courses', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

