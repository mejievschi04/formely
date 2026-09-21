<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('library_items', function (Blueprint $table) {
            if (! Schema::hasColumn('library_items', 'content_type')) {
                $table->string('content_type', 16)->default('file')->after('description');
            }
            if (! Schema::hasColumn('library_items', 'body')) {
                $table->longText('body')->nullable()->after('content_type');
            }
        });

        Schema::table('library_items', function (Blueprint $table) {
            $table->string('original_filename')->nullable()->change();
            $table->string('stored_path')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('library_items', function (Blueprint $table) {
            if (Schema::hasColumn('library_items', 'body')) {
                $table->dropColumn('body');
            }
            if (Schema::hasColumn('library_items', 'content_type')) {
                $table->dropColumn('content_type');
            }
        });
    }
};
