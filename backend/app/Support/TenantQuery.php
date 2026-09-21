<?php

namespace App\Support;

use Illuminate\Database\Query\Builder as QueryBuilder;

class TenantQuery
{
    public static function constrainUsers(QueryBuilder $query, string $usersAlias = 'users'): QueryBuilder
    {
        if (TenantContext::denyTenantData()) {
            return $query->whereRaw('1 = 0');
        }

        if (TenantContext::shouldScope()) {
            return $query->where($usersAlias.'.company_id', TenantContext::companyId());
        }

        return $query;
    }
}
