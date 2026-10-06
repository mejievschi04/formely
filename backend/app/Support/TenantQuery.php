<?php

namespace App\Support;

use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Constrângeri de tenant pentru query-urile raw (DB::table), unde global scope-ul
 * CompanyScope nu se aplică. Fără tenant în context (CLI, joburi) nu filtrează.
 */
class TenantQuery
{
    /** Pentru query-uri care au deja join pe `users`. */
    public static function constrainUsers(QueryBuilder $query, string $usersAlias = 'users'): QueryBuilder
    {
        if (TenantContext::denyTenantData()) {
            return $query->whereRaw('1 = 0');
        }

        if (TenantContext::shouldScope()) {
            TenantContext::constrain($query, $usersAlias.'.company_id');

            return $query;
        }

        return $query;
    }

    /** Pentru query-uri fără join pe `users`: filtrează coloana user_id prin subquery. */
    public static function constrainUserColumn(QueryBuilder $query, string $column): QueryBuilder
    {
        if (TenantContext::denyTenantData()) {
            return $query->whereRaw('1 = 0');
        }

        if (TenantContext::shouldScope()) {
            return $query->whereIn($column, function ($sub) {
                $sub->select('id')->from('users');
                TenantContext::constrain($sub, 'users.company_id');
            });
        }

        return $query;
    }
}
