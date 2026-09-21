<?php

namespace App\Services;

use App\Models\Company;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\Scopes\CompanyScope;
use App\Support\UserRoles;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class PlanEntitlementService
{
    /** @var list<string> */
    public const FEATURE_KEYS = [
        'ai_creator',
        'ai_builder',
        'ai_tutor',
        'ai_qa',
        'ai_stats',
        'ai_test_generation',
        'library',
        'events',
        'analyst_role',
    ];

    public function planCatalog(): array
    {
        return config('plans', []);
    }

    public function defaultsForPlan(string $plan): array
    {
        $catalog = $this->planCatalog();
        if (! isset($catalog[$plan])) {
            $plan = 'instructor';
        }

        $entry = $catalog[$plan] ?? $catalog['instructor'] ?? [];

        return [
            'plan' => $plan,
            'max_active_learners' => array_key_exists('max_active_learners', $entry)
                ? $entry['max_active_learners']
                : 50,
            'max_staff' => array_key_exists('max_staff', $entry)
                ? $entry['max_staff']
                : 2,
            'features' => $entry['features'] ?? [],
        ];
    }

    public function resolveCompany(?Company $company): ?Company
    {
        return $company;
    }

    /**
     * @return array<string, bool>
     */
    public function featuresFor(Company $company): array
    {
        $defaults = $this->defaultsForPlan((string) ($company->plan ?: 'instructor'));
        $out = [];
        foreach (self::FEATURE_KEYS as $key) {
            $out[$key] = (bool) ($defaults['features'][$key] ?? false);
        }

        return $out;
    }

    public function companyCan(Company $company, string $feature): bool
    {
        if (! $company->isUsable()) {
            return false;
        }

        $features = $this->featuresFor($company);

        return (bool) ($features[$feature] ?? false);
    }

    public function clampLearnerCap(string $plan, mixed $requested): ?int
    {
        $planMax = $this->defaultsForPlan($plan)['max_active_learners'];
        if ($requested === null || $requested === '') {
            return $planMax;
        }
        $requested = (int) $requested;
        if ($planMax === null) {
            return max(1, $requested);
        }

        return max(1, min($requested, $planMax));
    }

    public function clampStaffCap(string $plan, mixed $requested): ?int
    {
        $planMax = $this->defaultsForPlan($plan)['max_staff'];
        if ($requested === null || $requested === '') {
            return $planMax;
        }
        $requested = (int) $requested;
        if ($planMax === null) {
            return max(1, $requested);
        }

        return max(1, min($requested, $planMax));
    }

    public function maxActiveLearners(Company $company): ?int
    {
        return $this->clampLearnerCap(
            (string) ($company->plan ?: 'instructor'),
            $company->max_active_learners
        );
    }

    public function maxStaff(Company $company): ?int
    {
        return $this->clampStaffCap(
            (string) ($company->plan ?: 'instructor'),
            $company->max_staff
        );
    }

    public function countActiveLearners(Company $company): int
    {
        return User::withoutGlobalScope(CompanyScope::class)
            ->where('company_id', $company->id)
            ->whereIn('role', [UserRoles::EMPLOYEE, UserRoles::LEGACY_STUDENT])
            ->when(
                Schema::hasColumn('users', 'status'),
                fn ($q) => $q->where(function ($q2) {
                    $q2->whereNull('status')->orWhereNotIn('status', ['inactive', 'suspended', 'deleted']);
                })
            )
            ->count();
    }

    public function countStaff(Company $company): int
    {
        $staffRoles = [
            UserRoles::COMPANY_OWNER,
            UserRoles::HR_ADMIN,
            UserRoles::MANAGER,
            UserRoles::INSTRUCTOR,
            UserRoles::ANALYST,
            UserRoles::LEGACY_ADMIN,
        ];

        return User::withoutGlobalScope(CompanyScope::class)
            ->where('company_id', $company->id)
            ->whereIn('role', $staffRoles)
            ->when(
                Schema::hasColumn('users', 'status'),
                fn ($q) => $q->where(function ($q2) {
                    $q2->whereNull('status')->orWhereNotIn('status', ['inactive', 'suspended', 'deleted']);
                })
            )
            ->count();
    }

    public function pendingInvitationCount(Company $company, bool $staff, ?int $excludeInvitationId = null): int
    {
        $query = UserInvitation::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now());

        if ($excludeInvitationId) {
            $query->where('id', '!=', $excludeInvitationId);
        }

        $roles = $staff
            ? [
                UserRoles::COMPANY_OWNER,
                UserRoles::HR_ADMIN,
                UserRoles::MANAGER,
                UserRoles::INSTRUCTOR,
                UserRoles::ANALYST,
                UserRoles::LEGACY_ADMIN,
            ]
            : [UserRoles::EMPLOYEE, UserRoles::LEGACY_STUDENT];

        return $query->whereIn('role', $roles)->count();
    }

    public function learnerSeatAvailable(Company $company, int $adding = 1, ?int $excludeInvitationId = null): bool
    {
        $max = $this->maxActiveLearners($company);
        if ($max === null) {
            return true;
        }

        $used = $this->countActiveLearners($company)
            + $this->pendingInvitationCount($company, false, $excludeInvitationId);

        return ($used + $adding) <= $max;
    }

    public function staffSeatAvailable(Company $company, int $adding = 1, ?int $excludeInvitationId = null): bool
    {
        $max = $this->maxStaff($company);
        if ($max === null) {
            return true;
        }

        $used = $this->countStaff($company)
            + $this->pendingInvitationCount($company, true, $excludeInvitationId);

        return ($used + $adding) <= $max;
    }

    public function assertSeatAvailable(Company $company, string $role, int $adding = 1, ?int $excludeInvitationId = null): void
    {
        if (! $company->isUsable()) {
            throw ValidationException::withMessages([
                'role' => ['Compania nu este activă. Nu poți adăuga conturi.'],
            ]);
        }

        if ($this->isLearnerRole($role) && ! $this->learnerSeatAvailable($company, $adding, $excludeInvitationId)) {
            throw ValidationException::withMessages([
                'role' => ['Ai atins limita de cursanți activi pentru planul curent.'],
            ]);
        }

        if ($this->isStaffRole($role) && ! $this->staffSeatAvailable($company, $adding, $excludeInvitationId)) {
            throw ValidationException::withMessages([
                'role' => ['Ai atins limita de conturi staff pentru planul curent.'],
            ]);
        }

        if ($this->isStaffRole($role)
            && UserRoles::normalize($role) === UserRoles::ANALYST
            && ! $this->companyCan($company, 'analyst_role')
        ) {
            throw ValidationException::withMessages([
                'role' => ['Rolul analist nu este inclus în planul organizației.'],
            ]);
        }
    }

    public function isStaffRole(string $role): bool
    {
        $normalized = UserRoles::normalize($role);

        return in_array($normalized, [
            UserRoles::COMPANY_OWNER,
            UserRoles::HR_ADMIN,
            UserRoles::MANAGER,
            UserRoles::INSTRUCTOR,
            UserRoles::ANALYST,
            UserRoles::LEGACY_ADMIN,
        ], true);
    }

    public function isLearnerRole(string $role): bool
    {
        $normalized = UserRoles::normalize($role);

        return $normalized === UserRoles::EMPLOYEE;
    }

    /**
     * Payload for frontend /auth/me.
     *
     * @return array<string, mixed>
     */
    public function entitlementsPayload(Company $company): array
    {
        $maxLearners = $this->maxActiveLearners($company);
        $maxStaff = $this->maxStaff($company);
        $learnersUsed = $this->countActiveLearners($company);
        $staffUsed = $this->countStaff($company);

        return [
            'plan' => $company->plan ?: 'instructor',
            'plan_label' => (string) (config('plans.'.($company->plan ?: 'instructor').'.label') ?? 'Instructor'),
            'status' => $company->status,
            'features' => $this->featuresFor($company),
            'seats' => [
                'learners' => [
                    'used' => $learnersUsed,
                    'max' => $maxLearners,
                    'pending_invites' => $this->pendingInvitationCount($company, false),
                    'available' => $this->learnerSeatAvailable($company, 1),
                ],
                'staff' => [
                    'used' => $staffUsed,
                    'max' => $maxStaff,
                    'pending_invites' => $this->pendingInvitationCount($company, true),
                    'available' => $this->staffSeatAvailable($company, 1),
                ],
            ],
            'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            'contract_ends_at' => $company->contract_ends_at?->toIso8601String(),
        ];
    }
}
