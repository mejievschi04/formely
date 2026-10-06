<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('course_test')->where('required', false)->update(['required' => true]);
    }

    public function down(): void
    {
        // Previous per-test choices cannot be reconstructed safely.
    }
};
