<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->where('role', 'super_admin')
            ->whereNull('company_id')
            ->update(['role' => 'platform_operator']);

        DB::table('users')
            ->where('role', 'super_admin')
            ->whereNotNull('company_id')
            ->update(['role' => 'company_owner']);
    }

    public function down(): void
    {
        DB::table('users')
            ->where('role', 'platform_operator')
            ->whereNull('company_id')
            ->update(['role' => 'super_admin']);
    }
};
