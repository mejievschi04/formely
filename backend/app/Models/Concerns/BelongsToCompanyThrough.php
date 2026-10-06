<?php

namespace App\Models\Concerns;

use App\Models\Scopes\CompanyThroughScope;

/**
 * Pentru modelele fără company_id. Implicit academia vine din user_id → users;
 * modelul poate suprascrie companyThrough() (ex. ['course_id', 'courses']).
 */
trait BelongsToCompanyThrough
{
    public static function bootBelongsToCompanyThrough(): void
    {
        [$column, $parentTable] = static::companyThrough();
        static::addGlobalScope(new CompanyThroughScope($column, $parentTable));
    }

    /** @return array{0: string, 1: string} */
    protected static function companyThrough(): array
    {
        return ['user_id', 'users'];
    }
}
