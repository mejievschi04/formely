<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('registration_invitations', function (Blueprint $table) {
            if (! Schema::hasColumn('registration_invitations', 'email_status')) {
                $table->string('email_status', 20)->default('pending')->after('accepted_at');
            }
            if (! Schema::hasColumn('registration_invitations', 'email_sent_at')) {
                $table->timestamp('email_sent_at')->nullable()->after('email_status');
            }
            if (! Schema::hasColumn('registration_invitations', 'email_last_error')) {
                $table->text('email_last_error')->nullable()->after('email_sent_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('registration_invitations', function (Blueprint $table) {
            $columns = ['email_status', 'email_sent_at', 'email_last_error'];
            foreach ($columns as $column) {
                if (Schema::hasColumn('registration_invitations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
