<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Progresul fixat la publicarea unei versiuni noi a cursului: lecțiile sau testele adăugate ulterior
 * nu scad progresul cursantului sub această valoare; 100 înseamnă că finalizarea rămâne valabilă.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('course_user', 'progress_floor')) {
            Schema::table('course_user', function (Blueprint $table) {
                $table->unsignedTinyInteger('progress_floor')->nullable()->after('progress_percentage');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('course_user', 'progress_floor')) {
            Schema::table('course_user', function (Blueprint $table) {
                $table->dropColumn('progress_floor');
            });
        }
    }
};
