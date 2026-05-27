<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Elimină rolurile legacy teacher / manager din users.
     * teacher → instructor (păstrează acces la creare cursuri).
     * manager → student (fără rol de staff separat).
     */
    public function up(): void
    {
        DB::table('users')->where('role', 'teacher')->update(['role' => 'instructor']);
        DB::table('users')->where('role', 'manager')->update(['role' => 'student']);
    }

    public function down(): void
    {
        // Nu revenim: nu putem distinge instructorii migrați de cei creați ca atare.
    }
};
