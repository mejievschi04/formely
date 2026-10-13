<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanyAiUsage;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AiQuotaService
{
    public const ACTION_COURSE = 'course_generation';

    public const ACTION_TEST = 'test_generation';

    public const ACTION_TUTOR = 'tutor';

    /** Contor unic lunar în company_ai_usages.action */
    public const ACTION_CREDITS = 'credits';

    /** @var list<string> */
    public const ACTIONS = [
        self::ACTION_COURSE,
        self::ACTION_TEST,
        self::ACTION_TUTOR,
    ];

    public function __construct(
        private PlanEntitlementService $entitlements,
    ) {}

    public function currentPeriod(): string
    {
        return now('UTC')->format('Y-m');
    }

    public function costFor(string $action): int
    {
        if (! in_array($action, self::ACTIONS, true)) {
            return 1;
        }

        $costs = config('ai.credit_costs', []);

        return max(1, (int) ($costs[$action] ?? 1));
    }

    /**
     * @return array<string, int>
     */
    public function costs(): array
    {
        $out = [];
        foreach (self::ACTIONS as $action) {
            $out[$action] = $this->costFor($action);
        }

        return $out;
    }

    /**
     * Pool lunar de credite (null = unlimited).
     */
    public function creditLimitFor(Company $company): ?int
    {
        $plan = (string) ($company->plan ?: 'instructor');
        $entry = config('plans.'.$plan, []);
        if (! is_array($entry) || ! array_key_exists('ai_credits', $entry)) {
            return 0;
        }
        if ($entry['ai_credits'] === null) {
            return null;
        }

        return (int) $entry['ai_credits'];
    }

    public function creditsUsed(Company $company, ?string $period = null): int
    {
        $period ??= $this->currentPeriod();

        if (! Schema::hasTable('company_ai_usages')) {
            return 0;
        }

        return (int) CompanyAiUsage::query()
            ->where('company_id', $company->id)
            ->where('period', $period)
            ->where('action', self::ACTION_CREDITS)
            ->value('used');
    }

    public function creditsRemaining(Company $company): ?int
    {
        $limit = $this->creditLimitFor($company);
        if ($limit === null) {
            return null;
        }
        if ($limit <= 0) {
            return 0;
        }

        return max(0, $limit - $this->creditsUsed($company));
    }

    /**
     * View pe acțiune: câte acțiuni de tipul X mai încap în creditele rămase.
     *
     * @return array<string, int|null>
     */
    public function limitsFor(Company $company): array
    {
        $creditLimit = $this->creditLimitFor($company);
        $out = [];
        foreach (self::ACTIONS as $action) {
            $cost = $this->costFor($action);
            if ($creditLimit === null) {
                $out[$action] = null;
            } elseif ($creditLimit <= 0) {
                $out[$action] = 0;
            } else {
                $out[$action] = intdiv($creditLimit, $cost);
            }
        }

        return $out;
    }

    /**
     * @return array<string, int>
     */
    public function usedFor(Company $company, ?string $period = null): array
    {
        $period ??= $this->currentPeriod();
        $usedCredits = $this->creditsUsed($company, $period);
        $out = [];
        foreach (self::ACTIONS as $action) {
            $cost = $this->costFor($action);
            $out[$action] = intdiv($usedCredits, $cost);
        }
        $out[self::ACTION_CREDITS] = $usedCredits;

        return $out;
    }

    public function remaining(Company $company, string $action): ?int
    {
        if ($action === self::ACTION_CREDITS) {
            return $this->creditsRemaining($company);
        }

        $creditsLeft = $this->creditsRemaining($company);
        if ($creditsLeft === null) {
            return null;
        }

        return intdiv($creditsLeft, $this->costFor($action));
    }

    public function canConsume(Company $company, string $action, int $amount = 1): bool
    {
        if (! $company->isUsable()) {
            return false;
        }

        if (! in_array($action, self::ACTIONS, true)) {
            return false;
        }

        $remaining = $this->creditsRemaining($company);
        if ($remaining === null) {
            return true;
        }

        $cost = $this->costFor($action) * max(1, $amount);

        return $remaining >= $cost;
    }

    public function assertCan(Company $company, string $action, int $amount = 1): void
    {
        if (! in_array($action, self::ACTIONS, true)) {
            $this->throwExceeded($company, $action, 0, 0);
        }

        $cost = $this->costFor($action) * max(1, $amount);

        if (! Schema::hasTable('company_ai_usages')) {
            if (! $this->canConsume($company, $action, $amount)) {
                $this->throwExceeded(
                    $company,
                    $action,
                    $this->creditsUsed($company),
                    $this->creditLimitFor($company)
                );
            }

            return;
        }

        DB::transaction(function () use ($company, $action, $cost) {
            $row = $this->lockedCreditsRow($company);
            $limit = $this->creditLimitFor($company);
            $used = (int) $row->used;

            if ($limit === null) {
                return;
            }
            if ((int) $limit <= 0 || ($used + $cost) > (int) $limit) {
                $this->throwExceeded($company, $action, $used, $limit);
            }
        });
    }

    public function record(Company $company, string $action, int $amount = 1): void
    {
        if ($amount < 1 || ! in_array($action, self::ACTIONS, true)) {
            return;
        }
        if (! Schema::hasTable('company_ai_usages')) {
            return;
        }

        $cost = $this->costFor($action) * $amount;

        DB::transaction(function () use ($company, $action, $cost) {
            $row = $this->lockedCreditsRow($company);
            $limit = $this->creditLimitFor($company);
            $used = (int) $row->used;

            if ($limit !== null && (int) $limit > 0 && ($used + $cost) > (int) $limit) {
                $this->throwExceeded($company, $action, $used, $limit);
            }

            $row->increment('used', $cost);
        });
    }

    /**
     * Consume after feature gate: assert + record (atomic under row lock).
     */
    public function consume(Company $company, string $action, int $amount = 1): void
    {
        if ($amount < 1 || ! in_array($action, self::ACTIONS, true)) {
            return;
        }
        if (! Schema::hasTable('company_ai_usages')) {
            $this->assertCan($company, $action, $amount);

            return;
        }

        $cost = $this->costFor($action) * $amount;

        DB::transaction(function () use ($company, $action, $cost) {
            $row = $this->lockedCreditsRow($company);
            $limit = $this->creditLimitFor($company);
            $used = (int) $row->used;

            if ($limit !== null && ((int) $limit <= 0 || ($used + $cost) > (int) $limit)) {
                $this->throwExceeded($company, $action, $used, $limit);
            }

            $row->increment('used', $cost);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(Company $company, ?int $preloadedCreditsUsed = null): array
    {
        $period = $this->currentPeriod();
        $creditLimit = $this->creditLimitFor($company);
        $creditsUsed = $preloadedCreditsUsed ?? $this->creditsUsed($company, $period);
        $creditsRemaining = $creditLimit === null ? null : max(0, (int) $creditLimit - $creditsUsed);
        $costs = $this->costs();
        $actions = [];

        foreach (self::ACTIONS as $action) {
            $cost = $costs[$action];
            if ($creditLimit === null) {
                $actions[$action] = [
                    'used' => intdiv($creditsUsed, $cost),
                    'limit' => null,
                    'remaining' => null,
                    'unlimited' => true,
                    'credit_cost' => $cost,
                ];
            } else {
                $actionLimit = $creditLimit <= 0 ? 0 : intdiv((int) $creditLimit, $cost);
                $actionRemaining = $creditsRemaining === null ? 0 : intdiv($creditsRemaining, $cost);
                $actions[$action] = [
                    'used' => max(0, $actionLimit - $actionRemaining),
                    'limit' => $actionLimit,
                    'remaining' => $actionRemaining,
                    'unlimited' => false,
                    'credit_cost' => $cost,
                ];
            }
        }

        return [
            'period' => $period,
            'resets_at' => now('UTC')->startOfMonth()->addMonth()->toIso8601String(),
            'credits' => [
                'used' => $creditsUsed,
                'limit' => $creditLimit,
                'remaining' => $creditsRemaining,
                'unlimited' => $creditLimit === null,
            ],
            'costs' => $costs,
            'actions' => $actions,
        ];
    }

    public static function actionForGenerationType(string $type): string
    {
        return match ($type) {
            'test' => self::ACTION_TEST,
            'tutor' => self::ACTION_TUTOR,
            default => self::ACTION_COURSE,
        };
    }

    private function lockedCreditsRow(Company $company): CompanyAiUsage
    {
        $period = $this->currentPeriod();

        CompanyAiUsage::query()->firstOrCreate(
            [
                'company_id' => $company->id,
                'period' => $period,
                'action' => self::ACTION_CREDITS,
            ],
            ['used' => 0],
        );

        /** @var CompanyAiUsage $row */
        $row = CompanyAiUsage::query()
            ->where('company_id', $company->id)
            ->where('period', $period)
            ->where('action', self::ACTION_CREDITS)
            ->lockForUpdate()
            ->firstOrFail();

        return $row;
    }

    private function throwExceeded(Company $company, string $action, int $used, mixed $limit): void
    {
        throw new HttpResponseException(response()->json([
            'error' => 'Ai epuizat creditele Formely AI pentru luna aceasta. Trece la un plan superior sau așteaptă resetarea lunară.',
            'code' => 'ai_quota_exceeded',
            'action' => $action,
            'used' => $used,
            'limit' => $limit,
            'period' => $this->currentPeriod(),
            'upgrade_hint' => true,
            'ai_usage' => $this->payload($company),
        ], 429));
    }
}
