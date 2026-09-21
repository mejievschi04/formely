<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_invitations', function (Blueprint $table) {
            if (! Schema::hasColumn('user_invitations', 'encrypted_token')) {
                $table->text('encrypted_token')->nullable()->after('token');
            }
            if (! Schema::hasColumn('user_invitations', 'email_status')) {
                $table->string('email_status', 32)->default('pending')->after('accepted_at');
            }
            if (! Schema::hasColumn('user_invitations', 'email_sent_at')) {
                $table->timestamp('email_sent_at')->nullable()->after('email_status');
            }
            if (! Schema::hasColumn('user_invitations', 'email_last_error')) {
                $table->text('email_last_error')->nullable()->after('email_sent_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('user_invitations', function (Blueprint $table) {
            foreach (['encrypted_token', 'email_status', 'email_sent_at', 'email_last_error'] as $column) {
                if (Schema::hasColumn('user_invitations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
