<?php

namespace App\Support;

use App\Models\User;

class TenantContext
{
    private static ?int $companyId = null;

    private static bool $bypassScope = false;

    /** Operator platformă fără academie: nu vede datele tenantilor. */
    private static bool $denyTenantData = false;

    public static function setFromUser(?User $user): void
    {
        if (! $user) {
            self::clear();

            return;
        }

        self::$companyId = $user->company_id ? (int) $user->company_id : null;
        self::$bypassScope = false;
        self::$denyTenantData = $user->isPlatformAdmin();
    }

    public static function setCompanyId(?int $companyId): void
    {
        self::$companyId = $companyId;
        self::$bypassScope = false;
        self::$denyTenantData = false;
    }

    /** Fără tenant cunoscut: nu returna datele tuturor academiilor. */
    public static function denyAll(): void
    {
        self::$companyId = null;
        self::$bypassScope = false;
        self::$denyTenantData = true;
    }

    public static function companyId(): ?int
    {
        return self::$companyId;
    }

    public static function denyTenantData(): bool
    {
        return self::$denyTenantData;
    }

    public static function shouldScope(): bool
    {
        return self::$companyId !== null && ! self::$bypassScope && ! self::$denyTenantData;
    }

    public static function clear(): void
    {
        self::$companyId = null;
        self::$bypassScope = false;
        self::$denyTenantData = false;
    }
}
