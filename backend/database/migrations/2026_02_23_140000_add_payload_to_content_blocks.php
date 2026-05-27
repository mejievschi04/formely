<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Block-based content: structured JSON payload per block (instructiuni.md).
     */
    public function up(): void
    {
        if (!Schema::hasTable('content_blocks')) {
            return;
        }
        if (Schema::hasColumn('content_blocks', 'payload')) {
            return;
        }
        Schema::table('content_blocks', function (Blueprint $table) {
            $table->json('payload')->nullable()->after('metadata');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('content_blocks') && Schema::hasColumn('content_blocks', 'payload')) {
            Schema::table('content_blocks', function (Blueprint $table) {
                $table->dropColumn('payload');
            });
        }
    }
};
