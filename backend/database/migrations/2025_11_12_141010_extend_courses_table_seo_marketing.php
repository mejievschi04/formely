<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            // SEO fields
            if (!Schema::hasColumn('courses', 'meta_title')) {
                $table->string('meta_title', 60)->nullable()->after('rating_count');
            }
            if (!Schema::hasColumn('courses', 'meta_description')) {
                $table->text('meta_description')->nullable()->after('meta_title');
            }
            if (!Schema::hasColumn('courses', 'meta_keywords')) {
                $table->json('meta_keywords')->nullable()->after('meta_description');
            }
            
            // Marketing
            if (!Schema::hasColumn('courses', 'marketing_tags')) {
                $table->json('marketing_tags')->nullable()->after('meta_keywords');
            }
            
            // Certificate settings
            if (!Schema::hasColumn('courses', 'has_certificate')) {
                $table->boolean('has_certificate')->default(false)->after('marketing_tags');
            }
            if (!Schema::hasColumn('courses', 'min_exam_score')) {
                $table->integer('min_exam_score')->default(70)->after('has_certificate');
            }
            if (!Schema::hasColumn('courses', 'allow_retake')) {
                $table->boolean('allow_retake')->default(true)->after('min_exam_score');
            }
            if (!Schema::hasColumn('courses', 'max_retakes')) {
                $table->integer('max_retakes')->default(3)->after('allow_retake');
            }
            
            // Advanced settings
            if (!Schema::hasColumn('courses', 'drip_content')) {
                $table->boolean('drip_content')->default(false)->after('max_retakes');
            }
            if (!Schema::hasColumn('courses', 'drip_schedule')) {
                $table->string('drip_schedule', 20)->nullable()->after('drip_content');
            }
            if (!Schema::hasColumn('courses', 'comments_enabled')) {
                $table->boolean('comments_enabled')->default(true)->after('drip_schedule');
            }
            if (!Schema::hasColumn('courses', 'visibility')) {
                $table->enum('visibility', ['public', 'private', 'hidden'])->default('public')->after('comments_enabled');
            }
            
            // Permissions (stored as JSON)
            if (!Schema::hasColumn('courses', 'permissions')) {
                $table->json('permissions')->nullable()->after('visibility');
            }
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $columns = [
                'meta_title',
                'meta_description',
                'meta_keywords',
                'marketing_tags',
                'has_certificate',
                'min_exam_score',
                'allow_retake',
                'max_retakes',
                'drip_content',
                'drip_schedule',
                'comments_enabled',
                'visibility',
                'permissions',
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('courses', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

