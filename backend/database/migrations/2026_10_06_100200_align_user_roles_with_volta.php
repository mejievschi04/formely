<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * LMS-ul Formely folosește rolurile din Volta (admin / instructor / analyst / student).
 * Rolurile Formely de dinainte de aliniere se mapează pe cel mai apropiat echivalent.
 */
return new class extends Migration
{
    private array $map = [
        'company_owner' => 'admin',
        'hr_admin' => 'admin',
        'manager' => 'analyst',
        'employee' => 'student',
    ];

    public function up(): void
    {
        foreach (['users', 'user_invitations', 'registration_invitations'] as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'role')) {
                continue;
            }

            foreach ($this->map as $from => $to) {
                DB::table($table)->where('role', $from)->update(['role' => $to]);
            }
        }
    }

    public function down(): void
    {
        // Ireversibil: hr_admin/company_owner (și manager/analyst) nu se mai pot distinge.
    }
};
