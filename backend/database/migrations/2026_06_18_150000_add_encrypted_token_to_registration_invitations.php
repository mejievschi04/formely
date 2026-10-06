<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('registration_invitations', function (Blueprint $table) {
            if (! Schema::hasColumn('registration_invitations', 'encrypted_token')) {
                $table->text('encrypted_token')->nullable()->after('token');
            }
        });
    }

    public function down(): void
    {
        Schema::table('registration_invitations', function (Blueprint $table) {
            if (Schema::hasColumn('registration_invitations', 'encrypted_token')) {
                $table->dropColumn('encrypted_token');
            }
        });
    }
};
