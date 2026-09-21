<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('course_maps')) {
            return;
        }

        Schema::table('course_maps', function (Blueprint $table) {
            if (! Schema::hasColumn('course_maps', 'header_bg_color')) {
                $table->string('header_bg_color', 32)->nullable()->after('accent_color');
            }
            if (! Schema::hasColumn('course_maps', 'header_text_color')) {
                $table->string('header_text_color', 32)->nullable()->after('header_bg_color');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('course_maps')) {
            return;
        }

        Schema::table('course_maps', function (Blueprint $table) {
            if (Schema::hasColumn('course_maps', 'header_text_color')) {
                $table->dropColumn('header_text_color');
            }
            if (Schema::hasColumn('course_maps', 'header_bg_color')) {
                $table->dropColumn('header_bg_color');
            }
        });
    }
};
