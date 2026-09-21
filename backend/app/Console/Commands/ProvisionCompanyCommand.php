<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\PlanEntitlementService;
use App\Services\UserInvitationService;
use App\Support\UserRoles;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProvisionCompanyCommand extends Command
{
    protected $signature = 'formely:provision-company
        {name : Company display name}
        {--slug= : URL slug}
        {--plan=instructor : instructor|academie|business}
        {--owner-email= : Invite company_owner}
        {--owner-name= : Owner display name}
        {--status=trial : active|trial|suspended}';

    protected $description = 'Provision a tenant company (sales-led SaaS)';

    public function handle(PlanEntitlementService $entitlements, UserInvitationService $invitations): int
    {
        $name = trim((string) $this->argument('name'));
        $slug = Str::slug((string) ($this->option('slug') ?: $name));
        $plan = (string) $this->option('plan');
        $status = (string) $this->option('status');

        if (! isset(config('plans')[$plan])) {
            $this->error('Plan invalid.');

            return self::FAILURE;
        }

        if (Company::where('slug', $slug)->exists()) {
            $this->error("Slug deja folosit: {$slug}");

            return self::FAILURE;
        }

        $defaults = $entitlements->defaultsForPlan($plan);
        $operator = \App\Models\User::withoutGlobalScopes()
            ->where('role', UserRoles::PLATFORM_OPERATOR)
            ->whereNull('company_id')
            ->first()
            ?? \App\Models\User::withoutGlobalScopes()
                ->where('role', UserRoles::PLATFORM_OPERATOR)
                ->first();

        if (! $operator) {
            $this->error('Nu există operator platformă (backoffice) pentru a trimite invitația.');

            return self::FAILURE;
        }

        $company = DB::transaction(function () use ($name, $slug, $plan, $status, $defaults) {
            return Company::create([
                'name' => $name,
                'slug' => $slug,
                'status' => $status,
                'plan' => $plan,
                'max_active_learners' => $defaults['max_active_learners'],
                'max_staff' => $defaults['max_staff'],
                'features' => $defaults['features'],
                'trial_ends_at' => $status === 'trial' ? now()->addDays((int) config('formely.trial_days', 15)) : null,
            ]);
        });

        $this->info("Company #{$company->id} {$company->name} ({$company->plan})");

        $ownerEmail = $this->option('owner-email');
        if ($ownerEmail) {
            \App\Support\TenantContext::setCompanyId($company->id);
            $fakeRequest = Request::create('/');
            $result = $invitations->createAndSend(
                (string) $ownerEmail,
                $operator,
                $this->option('owner-name'),
                UserRoles::COMPANY_OWNER,
                null,
                $fakeRequest
            );
            $this->info('Owner invite: '.$result['invite_url']);
        }

        return self::SUCCESS;
    }
}
