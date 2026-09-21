<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('course_maps') || Schema::hasColumn('course_maps', 'cover_focus')) {
            return;
        }

        Schema::table('course_maps', function (Blueprint $table) {
            $table->json('cover_focus')->nullable()->after('cover_image_path');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('course_maps') || ! Schema::hasColumn('course_maps', 'cover_focus')) {
            return;
        }

        Schema::table('course_maps', function (Blueprint $table) {
            $table->dropColumn('cover_focus');
        });
    }
};
