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
        if (!Schema::hasTable('lessons')) {
            return;
        }

        // Ensure section_id exists (create_lessons_table already adds it, but keep safe)
        if (!Schema::hasColumn('lessons', 'section_id')) {
            Schema::table('lessons', function (Blueprint $table) {
                $table->unsignedBigInteger('section_id')->nullable()->after('course_id');
            });
        }

        // Add foreign key when sections exists (Postgres-safe: just attempt, ignore if already exists)
        if (Schema::hasTable('sections')) {
            try {
                Schema::table('lessons', function (Blueprint $table) {
                    $table->foreign('section_id', 'lessons_section_id_foreign')
                        ->references('id')
                        ->on('sections')
                        ->onDelete('cascade');
                });
            } catch (\Throwable $e) {
                // FK likely already exists or driver constraints differ; ignore
            }
        }

        // Add missing columns (idempotent)
        Schema::table('lessons', function (Blueprint $table) {
            if (!Schema::hasColumn('lessons', 'video_url')) {
                $table->text('video_url')->nullable()->after('content');
            }
            if (!Schema::hasColumn('lessons', 'resources')) {
                $table->text('resources')->nullable()->after('video_url'); // JSON array pentru documente, link-uri, etc.
            }
            if (!Schema::hasColumn('lessons', 'duration_minutes')) {
                $table->integer('duration_minutes')->nullable()->after('resources');
            }
            if (!Schema::hasColumn('lessons', 'is_preview')) {
                $table->boolean('is_preview')->default(false)->after('order'); // Lecție gratuită de preview
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('lessons')) {
            return;
        }

        try {
            Schema::table('lessons', function (Blueprint $table) {
                $table->dropForeign('lessons_section_id_foreign');
            });
        } catch (\Throwable $e) {
            // ignore
        }

        Schema::table('lessons', function (Blueprint $table) {
            $cols = ['video_url', 'resources', 'duration_minutes', 'is_preview'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('lessons', $col)) {
                    $table->dropColumn($col);
                }
            }
            // Do not drop section_id in down: it is created in create_lessons_table.
        });
    }
};
