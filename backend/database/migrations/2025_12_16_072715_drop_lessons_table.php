<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // NOTE (2026-01): This migration is deprecated.
        // The platform relies on `lessons` for LMS core (courses/modules/lessons/content blocks).
        // Dropping `lessons` breaks fresh migrations on Postgres due to existing foreign keys (e.g. exams).
        // Keep as a no-op to preserve a working dev environment.
        return;
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // no-op
    }
};
