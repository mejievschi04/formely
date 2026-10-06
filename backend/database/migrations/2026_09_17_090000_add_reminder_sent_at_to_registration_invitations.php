<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('registration_invitations') || Schema::hasColumn('registration_invitations', 'reminder_sent_at')) {
            return;
        }

        Schema::table('registration_invitations', function (Blueprint $table) {
            $table->timestamp('reminder_sent_at')->nullable()->after('email_sent_at');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('registration_invitations') && Schema::hasColumn('registration_invitations', 'reminder_sent_at')) {
            Schema::table('registration_invitations', function (Blueprint $table) {
                $table->dropColumn('reminder_sent_at');
            });
        }
    }
};
