<?php

namespace App\Services;

use App\Models\Company;

/**
 * Thin gate: assert before AI work, record only after billable success.
 */
class AiQuotaGate
{
    public function __construct(
        private AiQuotaService $quotas,
    ) {}

    public function assertAvailable(Company $company, ?string $action): void
    {
        if ($action === null || $action === '') {
            return;
        }
        $this->quotas->assertCan($company, $action);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function recordSuccess(Company $company, ?string $action): ?array
    {
        if ($action === null || $action === '') {
            return null;
        }
        $this->quotas->record($company, $action);

        return $this->quotas->payload($company);
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(Company $company): array
    {
        return $this->quotas->payload($company);
    }
}
