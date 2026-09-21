<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Company;
use App\Models\User;
use App\Services\PlanEntitlementService;
use App\Support\UserRoles;

trait AssertsPlanEntitlements
{
    protected function companyForEntitlements(?User $user = null): ?Company
    {
        $user = $user ?: auth()->user();
        if (! $user || ! $user->company_id) {
            return null;
        }

        return Company::withoutGlobalScopes()->find($user->company_id);
    }

    protected function entitlements(): PlanEntitlementService
    {
        return app(PlanEntitlementService::class);
    }

    protected function assertCompanyFeature(string $feature, ?User $user = null): void
    {
        $user = $user ?: auth()->user();
        if ($user && $user->isPlatformAdmin()) {
            abort(403, 'Operatorul platformei nu accesează funcțiile academiei.');
        }

        $company = $this->companyForEntitlements($user);
        if (! $company) {
            abort(403, 'Companie lipsă pentru această acțiune.');
        }

        if (! $company->isUsable()) {
            abort(403, 'Compania nu este activă.');
        }

        if (! $this->entitlements()->companyCan($company, $feature)) {
            abort(403, 'Această funcție nu este inclusă în planul organizației.');
        }
    }

    protected function assertSeatForRole(string $role, int $count = 1, ?User $user = null): void
    {
        $user = $user ?: auth()->user();
        $company = $this->companyForEntitlements($user);
        if (! $company) {
            return;
        }

        $this->entitlements()->assertSeatAvailable($company, $role, $count);
    }

    protected function assertSeatForRoleChange(User $target, string $newRole): void
    {
        if (UserRoles::normalize($target->role) === UserRoles::normalize($newRole)) {
            return;
        }

        $company = $target->company_id
            ? Company::withoutGlobalScopes()->find($target->company_id)
            : $this->companyForEntitlements();
        if (! $company) {
            return;
        }

        $service = $this->entitlements();
        $oldLearner = $service->isLearnerRole((string) $target->role);
        $newLearner = $service->isLearnerRole($newRole);
        $oldStaff = $service->isStaffRole((string) $target->role);
        $newStaff = $service->isStaffRole($newRole);

        if ($newLearner && ! $oldLearner) {
            $service->assertSeatAvailable($company, $newRole, 1);
            return;
        }

        if ($newStaff && ! $oldStaff) {
            $service->assertSeatAvailable($company, $newRole, 1);
            return;
        }

        if ($newStaff && $oldStaff && UserRoles::normalize($newRole) === UserRoles::ANALYST) {
            $service->assertSeatAvailable($company, $newRole, 0);
        }
    }
}
