<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('courses', 'settings')) {
            Schema::table('courses', fn (Blueprint $table) => $table->json('settings')->nullable());
        }
    }

    public function down(): void
    {
        // The original migration owns this column; retain existing course settings on rollback.
    }
};
