<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('course_user') || Schema::hasColumn('course_user', 'assignment_source')) {
            return;
        }

        Schema::table('course_user', function (Blueprint $table) {
            $table->string('assignment_source', 16)->nullable();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('course_user') || ! Schema::hasColumn('course_user', 'assignment_source')) {
            return;
        }

        Schema::table('course_user', function (Blueprint $table) {
            $table->dropColumn('assignment_source');
        });
    }
};
