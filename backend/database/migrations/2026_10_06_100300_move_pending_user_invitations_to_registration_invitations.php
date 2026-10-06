<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Invitațiile Formely (user_invitations) trec pe sistemul Volta (registration_invitations).
 * Se mută doar cele încă valabile; tokenul rămâne același, deci linkul trimis deja funcționează
 * (frontend-ul redirecționează /accept-invite?token= spre /register/invite/{token}).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('user_invitations') || ! Schema::hasTable('registration_invitations')
            || ! Schema::hasColumn('user_invitations', 'encrypted_token')) {
            return;
        }

        $hasCompany = Schema::hasColumn('user_invitations', 'company_id')
            && Schema::hasColumn('registration_invitations', 'company_id');

        DB::table('user_invitations')
            ->whereNull('accepted_at')
            ->whereNotNull('encrypted_token')
            ->where('expires_at', '>', now())
            ->orderBy('id')
            ->each(function ($invitation) use ($hasCompany) {
                try {
                    $plainToken = Crypt::decryptString($invitation->encrypted_token);
                } catch (\Throwable) {
                    return;
                }

                $email = strtolower(trim((string) $invitation->email));
                if (DB::table('registration_invitations')->where('email', $email)->whereNull('accepted_at')->exists()) {
                    return;
                }

                $row = [
                    'email' => $email,
                    'token' => hash('sha256', $plainToken),
                    'encrypted_token' => $invitation->encrypted_token,
                    'name' => $invitation->name,
                    'role' => $invitation->role ?: 'student',
                    'team_id' => $invitation->team_id,
                    'invited_by' => $invitation->invited_by,
                    'expires_at' => $invitation->expires_at,
                    'email_status' => $invitation->email_status ?? 'sent',
                    'email_sent_at' => $invitation->email_sent_at ?? null,
                    'created_at' => $invitation->created_at,
                    'updated_at' => now(),
                ];
                if ($hasCompany) {
                    $row['company_id'] = $invitation->company_id;
                }

                DB::table('registration_invitations')->insert($row);
            });
    }

    public function down(): void
    {
        // Tabelul user_invitations rămâne neatins; nimic de refăcut.
    }
};
