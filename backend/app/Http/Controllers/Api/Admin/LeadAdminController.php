<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Lead;
use App\Models\User;
use App\Models\UserInvitation;
use App\Services\PlanEntitlementService;
use App\Services\UserInvitationService;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LeadAdminController extends Controller
{
    public function __construct(
        private PlanEntitlementService $entitlements,
        private UserInvitationService $invitations,
    ) {}

    public function index(Request $request)
    {
        $query = Lead::query()->orderByDesc('created_at');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->get('q', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate(min(100, max(1, (int) $request->get('per_page', 25))));
        $paginator->getCollection()->transform(fn (Lead $lead) => $lead->toPlatformArray());

        return response()->json($paginator);
    }

    public function update(Request $request, int $id)
    {
        $lead = Lead::findOrFail($id);
        $validated = $request->validate([
            'status' => 'required|in:new,contacted,qualified,won,lost',
        ]);

        $lead->status = $validated['status'];
        if ($validated['status'] === 'contacted' && ! $lead->contacted_at) {
            $lead->contacted_at = now();
        }
        $lead->save();

        return response()->json(['lead' => $lead->fresh()->toPlatformArray()]);
    }

    /**
     * Convert a lead into a tenant company + owner invite (sales-led path).
     */
    public function convert(Request $request, int $id)
    {
        $lead = Lead::findOrFail($id);

        if ($lead->company_id) {
            return response()->json([
                'message' => 'Lead-ul este deja legat de o companie.',
                'lead' => $lead->toPlatformArray(),
                'company' => Company::find($lead->company_id),
            ], 422);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'slug' => 'nullable|string|max:100|alpha_dash|unique:companies,slug',
            'plan' => 'nullable|in:instructor,academie,business',
            'status' => 'nullable|in:active,trial,suspended',
            'owner_email' => 'nullable|email|max:255',
            'owner_name' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:5000',
        ]);

        $companyName = trim((string) ($validated['name'] ?? $lead->company_name ?: $lead->name));
        $slug = Str::slug((string) ($validated['slug'] ?? $companyName));
        if ($slug === '' || Company::query()->where('slug', $slug)->exists()) {
            $slug = Str::slug($companyName.'-'.$lead->id);
        }

        $plan = (string) ($validated['plan'] ?? $lead->plan_interest ?: 'academie');
        if (! in_array($plan, ['instructor', 'academie', 'business'], true)) {
            $plan = 'academie';
        }
        $defaults = $this->entitlements->defaultsForPlan($plan);
        $status = $validated['status'] ?? Company::STATUS_TRIAL;
        $ownerEmail = strtolower(trim((string) ($validated['owner_email'] ?? $lead->email)));
        $ownerName = $validated['owner_name'] ?? $lead->name;

        [$company, $invite] = DB::transaction(function () use (
            $lead,
            $companyName,
            $slug,
            $plan,
            $defaults,
            $status,
            $ownerEmail,
            $ownerName,
            $validated,
            $request
        ) {
            $company = Company::create([
                'name' => $companyName,
                'slug' => $slug,
                'status' => $status,
                'plan' => $plan,
                'max_active_learners' => $defaults['max_active_learners'],
                'max_staff' => $defaults['max_staff'],
                'features' => $defaults['features'],
                'trial_ends_at' => $status === Company::STATUS_TRIAL
                    ? now()->addDays((int) config('formely.trial_days', 15))
                    : null,
                'notes' => $validated['notes'] ?? ("Convertit din lead #{$lead->id}"),
                'primary_color' => '#0891b2',
                'secondary_color' => '#22d3ee',
            ]);

            $lead->company_id = $company->id;
            $lead->status = 'won';
            if (! $lead->contacted_at) {
                $lead->contacted_at = now();
            }
            $lead->save();

            $invite = $this->inviteOwner($company, $ownerEmail, $ownerName, $request);

            return [$company, $invite];
        });

        return response()->json([
            'message' => 'Lead convertit în academie.',
            'lead' => $lead->fresh()->toPlatformArray(),
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'slug' => $company->slug,
                'plan' => $company->plan,
                'status' => $company->status,
            ],
            'invite_url' => $invite['invite_url'] ?? null,
        ], 201);
    }

    private function inviteOwner(Company $company, string $email, ?string $name, Request $request): array
    {
        $inviter = $request->user();
        $email = strtolower(trim($email));

        $existingUser = User::withoutGlobalScopes()->where('email', $email)->first();
        if ($existingUser && (int) $existingUser->company_id !== (int) $company->id) {
            abort(422, 'Emailul aparține deja unei alte companii.');
        }
        if ($existingUser && (int) $existingUser->company_id === (int) $company->id) {
            return ['invite_url' => null, 'invitation' => null];
        }

        $pendingInvite = UserInvitation::withoutGlobalScopes()
            ->where('company_id', $company->id)
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->first();

        if (! $pendingInvite && ! $this->entitlements->staffSeatAvailable($company, 1)) {
            abort(422, 'Ai atins limita de conturi staff pentru planul curent.');
        }

        $previousCompanyId = TenantContext::companyId();
        TenantContext::setCompanyId($company->id);

        try {
            return $this->invitations->createAndSend(
                $email,
                $inviter,
                $name,
                UserRoles::COMPANY_OWNER,
                null,
                $request
            );
        } finally {
            if ($previousCompanyId) {
                TenantContext::setCompanyId($previousCompanyId);
            } else {
                TenantContext::clear();
                if ($inviter && $inviter->isPlatformAdmin()) {
                    TenantContext::setFromUser($inviter);
                }
            }
        }
    }
}
