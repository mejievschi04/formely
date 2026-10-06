<?php

namespace App\Support;

use Illuminate\Validation\DatabasePresenceVerifier;

/**
 * Regulile `exists` / `unique` rulează query-uri raw, fără CompanyScope.
 * Pentru tabelele cu company_id le limităm la academia curentă, ca un ID
 * dintr-o altă academie să nu treacă validarea. `users` rămâne global:
 * emailul este unic pe toată platforma.
 */
class TenantPresenceVerifier extends DatabasePresenceVerifier
{
    protected function table($table)
    {
        $query = parent::table($table);

        if ($table !== 'users' && TenantContext::shouldScope() && SchemaCache::hasColumn($table, 'company_id')) {
            TenantContext::constrain($query, $table . '.company_id');
        }

        return $query;
    }
}
