<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('guide_items');
    }

    public function down(): void
    {
        // Feature removed — no restore.
    }
};
