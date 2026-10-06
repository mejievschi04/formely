<?php

namespace App\Console\Commands;

use App\Services\RegistrationInvitationService;
use Illuminate\Console\Command;

class SendInvitationExpiryRemindersCommand extends Command
{
    protected $signature = 'volta:remind-invitation-expiry';

    protected $description = 'Trimite reminder pe email pentru invitațiile care expiră în 48 de ore.';

    public function handle(RegistrationInvitationService $invitations): int
    {
        $sent = $invitations->queueExpiryReminders();
        $this->info($sent === 1
            ? '1 reminder de invitație a fost pus în coadă.'
            : "{$sent} remindere de invitație au fost puse în coadă.");

        return self::SUCCESS;
    }
}
