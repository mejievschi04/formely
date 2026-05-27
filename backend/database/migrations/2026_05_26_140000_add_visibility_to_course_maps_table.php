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
            if (! Schema::hasColumn('course_maps', 'visibility')) {
                $table->enum('visibility', ['public', 'private'])->default('public')->after('description');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('course_maps')) {
            return;
        }

        Schema::table('course_maps', function (Blueprint $table) {
            if (Schema::hasColumn('course_maps', 'visibility')) {
                $table->dropColumn('visibility');
            }
        });
    }
};
