<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;

class ExpireCompanyTrialsCommand extends Command
{
    protected $signature = 'companies:expire-trials';

    protected $description = 'Suspend companies whose trial or contract window has ended';

    public function handle(): int
    {
        $trialExpired = Company::query()
            ->where('status', Company::STATUS_TRIAL)
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '<', now())
            ->update(['status' => Company::STATUS_SUSPENDED]);

        $contractExpired = Company::query()
            ->where('status', Company::STATUS_ACTIVE)
            ->whereNotNull('contract_ends_at')
            ->where('contract_ends_at', '<', now())
            ->update(['status' => Company::STATUS_SUSPENDED]);

        $this->info("Suspended {$trialExpired} expired trial(s) and {$contractExpired} expired contract(s).");

        return self::SUCCESS;
    }
}
