<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Lead;
use App\Models\User;
use App\Models\RegistrationInvitation;
use App\Models\Scopes\CompanyScope;
use App\Models\Scopes\CompanyThroughScope;
use App\Models\ActivityLog;
use App\Services\CompanyDeletionService;
use App\Services\PlanEntitlementService;
use App\Services\RegistrationInvitationService;
use App\Support\PlatformActivityLogger;
use App\Support\UserRoles;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CompanyAdminController extends Controller
{
    public function __construct(
        private PlanEntitlementService $entitlements,
        private RegistrationInvitationService $invitations,
        private CompanyDeletionService $companyDeletion,
    ) {}

    public function index(Request $request)
    {
        $query = Company::query()->orderBy('name');

        if ($search = trim((string) $request->get('q', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($plan = $request->get('plan')) {
            $query->where('plan', $plan);
        }

        if ($status = $request->get('status')) {
            // Acceptă și o listă: status=active,trial (ex. „De facturat”).
            $query->whereIn('status', array_filter(array_map('trim', explode(',', (string) $status))));
        }

        $companies = $query->paginate(min(100, max(1, (int) $request->get('per_page', 25))));

        $usage = $this->entitlements->seatUsage($companies->getCollection()->pluck('id'));
        $companies->getCollection()->transform(function (Company $company) use ($usage) {
            return $this->serializeCompany($company, false, $usage[(int) $company->id] ?? null);
        });

        return response()->json($companies);
    }

    public function show(int $id)
    {
        $company = Company::findOrFail($id);

        return response()->json([
            'company' => $this->serializeCompany($company, true),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateCompanyPayload($request, true);
        $validated = $this->applyPlanContract($validated);

        [$company, $invite] = DB::transaction(function () use ($validated, $request) {
            $company = Company::create([
                'name' => $validated['name'],
                'slug' => $validated['slug'],
                'status' => $validated['status'] ?? Company::STATUS_TRIAL,
                'plan' => $validated['plan'],
                'max_active_learners' => $validated['max_active_learners'],
                'max_staff' => $validated['max_staff'],
                'features' => $validated['features'],
                'trial_ends_at' => $validated['trial_ends_at'] ?? (($validated['status'] ?? Company::STATUS_TRIAL) === Company::STATUS_TRIAL ? now()->addDays((int) config('formely.trial_days', 15)) : null),
                'contract_ends_at' => $validated['contract_ends_at'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'primary_color' => $validated['primary_color'] ?? '#0891b2',
                'secondary_color' => $validated['secondary_color'] ?? '#22d3ee',
            ]);

            $invite = null;
            if (! empty($validated['owner_email'])) {
                $invite = $this->inviteOwner($company, $validated['owner_email'], $validated['owner_name'] ?? null, $request);
            }

            return [$company, $invite];
        });

        PlatformActivityLogger::log(
            $request,
            'platform.company_created',
            "Academie creată: {$company->name}",
            'Company',
            (int) $company->id,
            null,
            [
                'name' => $company->name,
                'slug' => $company->slug,
                'plan' => $company->plan,
                'status' => $company->status,
            ],
        );

        return response()->json([
            'message' => 'Compania a fost creată.',
            'company' => $this->serializeCompany($company->fresh(), true),
            'invite_url' => $invite['invite_url'] ?? null,
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $company = Company::findOrFail($id);
        $before = [
            'name' => $company->name,
            'slug' => $company->slug,
            'plan' => $company->plan,
            'status' => $company->status,
            'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            'contract_ends_at' => $company->contract_ends_at?->toIso8601String(),
            'notes' => $company->notes,
        ];
        $validated = $this->validateCompanyPayload($request, false, $company);
        $planChanging = isset($validated['plan']) && $validated['plan'] !== $company->plan;

        if ($planChanging) {
            $validated = $this->applyPlanContract($validated);
        } elseif (array_key_exists('max_active_learners', $validated) || array_key_exists('max_staff', $validated)) {
            $plan = (string) ($validated['plan'] ?? $company->plan ?: 'instructor');
            if (array_key_exists('max_active_learners', $validated)) {
                $validated['max_active_learners'] = $this->entitlements->clampLearnerCap($plan, $validated['max_active_learners']);
            }
            if (array_key_exists('max_staff', $validated)) {
                $validated['max_staff'] = $this->entitlements->clampStaffCap($plan, $validated['max_staff']);
            }
            $validated['features'] = $this->entitlements->defaultsForPlan($plan)['features'];
        } else {
            unset($validated['plan'], $validated['features'], $validated['max_active_learners'], $validated['max_staff']);
        }

        if (($validated['status'] ?? null) === Company::STATUS_TRIAL && ! $company->trial_ends_at && ! isset($validated['trial_ends_at'])) {
            $validated['trial_ends_at'] = now()->addDays((int) config('formely.trial_days', 15));
        }

        $company->fill($validated);
        $company->save();

        $after = [
            'name' => $company->name,
            'slug' => $company->slug,
            'plan' => $company->plan,
            'status' => $company->status,
            'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            'contract_ends_at' => $company->contract_ends_at?->toIso8601String(),
            'notes' => $company->notes,
        ];
        PlatformActivityLogger::log(
            $request,
            'platform.company_updated',
            "Academie actualizată: {$company->name}",
            'Company',
            (int) $company->id,
            $before,
            $after,
        );

        return response()->json([
            'message' => 'Compania a fost actualizată.',
            'company' => $this->serializeCompany($company->fresh(), true),
        ]);
    }

    public function inviteOwner(Company $company, string $email, ?string $name, Request $request): array
    {
        $inviter = $request->user();
        $email = strtolower(trim($email));

        $existingUser = User::withoutGlobalScopes()
            ->where('email', $email)
            ->first();

        if ($existingUser && (int) $existingUser->company_id !== (int) $company->id) {
            abort(422, 'Emailul aparține deja unei alte companii.');
        }

        if ($existingUser && (int) $existingUser->company_id === (int) $company->id) {
            abort(422, 'Acest email are deja un cont în academie.');
        }

        $pendingInvite = RegistrationInvitation::withoutGlobalScope(CompanyScope::class)
            ->where('company_id', $company->id)
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->first();

        if (! $pendingInvite && ! $this->entitlements->staffSeatAvailable($company, 1)) {
            abort(422, 'Ai atins limita de conturi staff pentru planul curent.');
        }

        return $this->invitations->createAndSend(
            $email,
            $inviter,
            $name,
            UserRoles::ADMIN,
            null,
            (int) config('formely.invitation_expire_days', 7),
            null,
            (int) $company->id
        );
    }

    public function sendOwnerInvite(Request $request, int $id)
    {
        $company = Company::findOrFail($id);
        $validated = $request->validate([
            'owner_email' => 'required|email|max:255',
            'owner_name' => 'nullable|string|max:255',
        ]);

        $result = $this->inviteOwner(
            $company,
            $validated['owner_email'],
            $validated['owner_name'] ?? null,
            $request
        );

        PlatformActivityLogger::log(
            $request,
            'platform.owner_invited',
            "Invitație owner pentru {$company->name}: {$validated['owner_email']}",
            'Company',
            (int) $company->id,
            null,
            ['owner_email' => $validated['owner_email']],
        );

        return response()->json([
            'message' => 'Invitația pentru proprietar a fost trimisă.',
            'invite_url' => $result['invite_url'],
            'invitation' => $result['invitation'],
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $company = Company::findOrFail($id);
        $validated = $request->validate([
            'confirm_slug' => 'required|string|max:100',
        ]);

        if (strcasecmp(trim($validated['confirm_slug']), (string) $company->slug) !== 0) {
            return response()->json([
                'message' => 'Pentru confirmare, scrie exact slug-ul academiei ('.$company->slug.').',
            ], 422);
        }

        $name = $company->name;
        $snapshot = $company->only(['id', 'name', 'slug', 'plan', 'status']);
        $this->companyDeletion->deletePermanently($company);

        PlatformActivityLogger::log(
            $request,
            'platform.company_deleted',
            "Academie ștearsă: {$name}",
            'Company',
            (int) $snapshot['id'],
            $snapshot,
            null,
        );

        return response()->json([
            'message' => "Academia „{$name}” a fost ștearsă definitiv.",
        ]);
    }

    /**
     * Platform-only audit trail (actions prefixed platform.*).
     * Separate from tenant LMS activity-logs — platform admins have denyTenantData.
     */
    public function activityLogs(Request $request)
    {
        $perPage = min(100, max(1, (int) $request->get('per_page', 50)));
        $search = trim((string) $request->get('q', ''));
        $action = $request->get('action');

        // Jurnalul platformei nu aparține unei academii: fără scope-ul de tenant (operatorul are denyTenantData).
        $query = ActivityLog::withoutGlobalScope(CompanyThroughScope::class)
            ->with(['user' => fn ($q) => $q->withoutGlobalScopes()->select('id', 'name', 'email')])
            ->where('action', 'like', 'platform.%')
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->withoutGlobalScopes()->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if ($action) {
            $query->where('action', $action);
        }

        $logs = $query->paginate($perPage);

        $actions = ActivityLog::withoutGlobalScope(CompanyThroughScope::class)
            ->where('action', 'like', 'platform.%')
            ->select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action')
            ->values();

        return response()->json([
            'data' => $logs->items(),
            'current_page' => $logs->currentPage(),
            'last_page' => $logs->lastPage(),
            'per_page' => $logs->perPage(),
            'total' => $logs->total(),
            'filters' => [
                'actions' => $actions,
            ],
        ]);
    }

    public function overview()
    {
        $companies = Company::query()->orderBy('name')->get();
        $usage = $this->entitlements->seatUsage($companies->pluck('id'));

        $byPlan = ['instructor' => 0, 'academie' => 0, 'business' => 0];
        $byStatus = ['active' => 0, 'trial' => 0, 'suspended' => 0];
        $learnersUsed = 0;
        $learnersCapped = 0;
        $unlimitedLearners = false;
        $staffUsed = 0;
        $staffCapped = 0;
        $attention = [];

        $serialized = [];
        foreach ($companies as $company) {
            $plan = (string) ($company->plan ?: 'instructor');
            if (array_key_exists($plan, $byPlan)) {
                $byPlan[$plan]++;
            }
            $status = (string) ($company->status ?: Company::STATUS_ACTIVE);
            if (array_key_exists($status, $byStatus)) {
                $byStatus[$status]++;
            }

            $row = $this->serializeCompany($company, false, $usage[(int) $company->id] ?? null);
            $serialized[] = $row;

            $learnerUsed = (int) ($row['entitlements']['seats']['learners']['used'] ?? 0);
            $learnerMax = $row['entitlements']['seats']['learners']['max'] ?? null;
            $staffCount = (int) ($row['entitlements']['seats']['staff']['used'] ?? 0);
            $staffMax = $row['entitlements']['seats']['staff']['max'] ?? null;

            $learnersUsed += $learnerUsed;
            $staffUsed += $staffCount;
            if ($learnerMax === null) {
                $unlimitedLearners = true;
            } else {
                $learnersCapped += $learnerMax;
            }
            if ($staffMax !== null) {
                $staffCapped += $staffMax;
            }

            foreach (($row['health']['reasons'] ?? []) as $reason) {
                $attention[] = array_merge($row, ['reason' => $reason]);
            }
        }

        usort($attention, function (array $a, array $b) {
            $rank = ['critical' => 0, 'watch' => 1, 'ok' => 2];

            return ($rank[$a['health']['severity'] ?? 'ok'] ?? 2) <=> ($rank[$b['health']['severity'] ?? 'ok'] ?? 2);
        });

        $attentionCompanies = collect($attention)->unique('id')->values();

        $sortedCompanies = collect($serialized)->sortBy(function (array $row) {
            $rank = ['critical' => 0, 'watch' => 1, 'ok' => 2];

            return ($rank[$row['health']['severity'] ?? 'ok'] ?? 2).'-'.mb_strtolower($row['name'] ?? '');
        })->values();

        return response()->json([
            'kpis' => [
                'companies' => $companies->count(),
                'users' => User::withoutGlobalScope(\App\Models\Scopes\CompanyScope::class)->whereNotNull('company_id')->count(),
                'learners' => [
                    'used' => $learnersUsed,
                    'max' => $unlimitedLearners ? null : $learnersCapped,
                ],
                'staff' => [
                    'used' => $staffUsed,
                    'max' => $staffCapped > 0 ? $staffCapped : null,
                ],
                'leads_new' => Lead::query()->where('status', 'new')->count(),
                'needs_attention' => $attentionCompanies->count(),
            ],
            'by_plan' => $byPlan,
            'by_status' => $byStatus,
            'leads_by_status' => $this->leadsByStatus(),
            'attention' => $attentionCompanies->take(12)->values(),
            'leads_recent' => Lead::query()->where('status', 'new')->orderByDesc('created_at')->limit(5)->get()->map->toPlatformArray()->values(),
            'companies' => $sortedCompanies->take(12)->values(),
        ]);
    }

    /**
     * @return array<string, int>
     */
    private function leadsByStatus(): array
    {
        $counts = [
            'new' => 0,
            'contacted' => 0,
            'qualified' => 0,
            'won' => 0,
            'lost' => 0,
        ];

        Lead::query()
            ->selectRaw('status, count(*) as c')
            ->groupBy('status')
            ->get()
            ->each(function ($row) use (&$counts) {
                $status = (string) $row->status;
                if (array_key_exists($status, $counts)) {
                    $counts[$status] = (int) $row->c;
                }
            });

        return $counts;
    }

    public function plans()
    {
        return response()->json([
            'plans' => collect($this->entitlements->planCatalog())->map(function (array $plan, string $key) {
                return [
                    'id' => $key,
                    'label' => $plan['label'] ?? $key,
                    'max_active_learners' => $plan['max_active_learners'] ?? null,
                    'max_staff' => $plan['max_staff'] ?? null,
                    'features' => $plan['features'] ?? [],
                ];
            })->values(),
            'trial_days' => (int) config('formely.trial_days', 15),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateCompanyPayload(Request $request, bool $creating, ?Company $existing = null): array
    {
        $slugRule = Rule::unique('companies', 'slug');
        if ($existing) {
            $slugRule = $slugRule->ignore($existing->id);
        }

        $rules = [
            'name' => ($creating ? 'required' : 'sometimes|required').'|string|max:255',
            'slug' => ($creating ? 'required' : 'sometimes|required').'|string|max:100|alpha_dash|'.$slugRule,
            'plan' => ($creating ? 'required' : 'sometimes|required').'|in:instructor,academie,business',
            'status' => 'nullable|in:active,trial,suspended',
            'max_active_learners' => 'nullable|integer|min:1',
            'max_staff' => 'nullable|integer|min:1',
            'features' => 'nullable|array',
            'trial_ends_at' => 'nullable|date',
            'contract_ends_at' => 'nullable|date',
            'notes' => 'nullable|string|max:5000',
            'primary_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'owner_email' => ($creating ? 'required' : 'sometimes').'|email|max:255',
            'owner_name' => 'nullable|string|max:255',
        ];

        $validated = $request->validate($rules);

        if (isset($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['slug']);
        }

        return $validated;
    }

    /**
     * Planul din catalog e plafon: features + locuri nu pot depăși abonamentul.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function applyPlanContract(array $validated): array
    {
        $plan = (string) ($validated['plan'] ?: 'instructor');
        $defaults = $this->entitlements->defaultsForPlan($plan);
        $validated['features'] = $defaults['features'];
        $validated['max_active_learners'] = $this->entitlements->clampLearnerCap(
            $plan,
            $validated['max_active_learners'] ?? $defaults['max_active_learners']
        );
        $validated['max_staff'] = $this->entitlements->clampStaffCap(
            $plan,
            $validated['max_staff'] ?? $defaults['max_staff']
        );

        return $validated;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCompany(Company $company, bool $detailed = false, ?array $usage = null): array
    {
        $entitlements = $this->entitlements->entitlementsPayload($company, $usage);
        $payload = [
            'id' => $company->id,
            'name' => $company->name,
            'slug' => $company->slug,
            'status' => $company->status,
            'plan' => $company->plan,
            'plan_label' => config('plans.'.$company->plan.'.label', $company->plan),
            'max_active_learners' => $company->max_active_learners,
            'max_staff' => $company->max_staff,
            'features' => $this->entitlements->featuresFor($company),
            'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            'contract_ends_at' => $company->contract_ends_at?->toIso8601String(),
            'primary_color' => $company->primary_color,
            'secondary_color' => $company->secondary_color,
            'logo_url' => $company->logoUrl(),
            'created_at' => $company->created_at?->toIso8601String(),
            'notes' => $detailed ? $company->notes : null,
            'entitlements' => $entitlements,
            'health' => $this->healthFrom($company, $entitlements),
        ];

        if ($detailed) {
            $payload['notes'] = $company->notes;
            $payload['users_count'] = User::withoutGlobalScopes()->where('company_id', $company->id)->count();
            $payload['pending_owner_invites'] = RegistrationInvitation::withoutGlobalScope(CompanyScope::class)
                ->where('company_id', $company->id)
                ->where('role', UserRoles::ADMIN)
                ->whereNull('accepted_at')
                ->count();
        }

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $entitlements
     * @return array{severity: string, reasons: list<string>, trial_days_left: int|null}
     */
    private function healthFrom(Company $company, array $entitlements): array
    {
        $reasons = [];

        if ($company->isSuspended()) {
            $reasons[] = 'suspended';
        }
        if ($company->isTrialExpired()) {
            $reasons[] = 'trial_expired';
        } elseif (($company->status ?: Company::STATUS_ACTIVE) === Company::STATUS_TRIAL
            && $company->trial_ends_at
            && $company->trial_ends_at->lte(now()->addDays(7))
        ) {
            $reasons[] = 'trial_ending';
        }

        $learnerUsed = (int) ($entitlements['seats']['learners']['used'] ?? 0);
        $learnerMax = $entitlements['seats']['learners']['max'] ?? null;
        if ($learnerMax !== null && $learnerMax > 0) {
            if ($learnerUsed >= $learnerMax) {
                $reasons[] = 'seats_full';
            } elseif (($learnerUsed / $learnerMax) >= 0.85) {
                $reasons[] = 'seats_high';
            }
        }

        $staffUsed = (int) ($entitlements['seats']['staff']['used'] ?? 0);
        $staffMax = $entitlements['seats']['staff']['max'] ?? null;
        if ($staffMax !== null && $staffMax > 0 && $staffUsed >= $staffMax) {
            $reasons[] = 'staff_full';
        }

        $critical = array_intersect($reasons, ['suspended', 'trial_expired', 'seats_full', 'staff_full']);
        $trialDaysLeft = null;
        if ($company->trial_ends_at) {
            $trialDaysLeft = (int) now()->startOfDay()->diffInDays($company->trial_ends_at->copy()->startOfDay(), false);
        }

        return [
            'severity' => $reasons === [] ? 'ok' : ($critical ? 'critical' : 'watch'),
            'reasons' => array_values($reasons),
            'trial_days_left' => $trialDaysLeft,
        ];
    }
}
