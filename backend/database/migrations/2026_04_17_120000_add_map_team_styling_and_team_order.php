<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('course_maps')) {
            Schema::table('course_maps', function (Blueprint $table) {
                if (!Schema::hasColumn('course_maps', 'accent_color')) {
                    $table->string('accent_color', 32)->nullable()->after('order');
                }
                if (!Schema::hasColumn('course_maps', 'cover_image_path')) {
                    $table->string('cover_image_path', 500)->nullable()->after('accent_color');
                }
            });
        }

        if (Schema::hasTable('teams')) {
            Schema::table('teams', function (Blueprint $table) {
                if (!Schema::hasColumn('teams', 'sort_order')) {
                    $table->unsignedSmallInteger('sort_order')->default(0)->after('owner_id');
                }
                if (!Schema::hasColumn('teams', 'accent_color')) {
                    $table->string('accent_color', 32)->nullable()->after('sort_order');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('course_maps')) {
            Schema::table('course_maps', function (Blueprint $table) {
                if (Schema::hasColumn('course_maps', 'cover_image_path')) {
                    $table->dropColumn('cover_image_path');
                }
                if (Schema::hasColumn('course_maps', 'accent_color')) {
                    $table->dropColumn('accent_color');
                }
            });
        }

        if (Schema::hasTable('teams')) {
            Schema::table('teams', function (Blueprint $table) {
                if (Schema::hasColumn('teams', 'accent_color')) {
                    $table->dropColumn('accent_color');
                }
                if (Schema::hasColumn('teams', 'sort_order')) {
                    $table->dropColumn('sort_order');
                }
            });
        }
    }
};
