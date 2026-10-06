<?php

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Tenant scope pentru tabelele fără company_id: rândul aparține academiei
 * părintelui (ex. test_results.user_id → users.company_id).
 */
class CompanyThroughScope implements Scope
{
    public function __construct(
        private string $column,
        private string $parentTable
    ) {}

    public function apply(Builder $builder, Model $model): void
    {
        if (TenantContext::denyTenantData()) {
            $builder->whereRaw('1 = 0');

            return;
        }

        if (! TenantContext::shouldScope()) {
            return;
        }

        $parentTable = $this->parentTable;
        $builder->whereIn($model->getTable() . '.' . $this->column, function ($sub) use ($parentTable) {
            $sub->select('id')->from($parentTable);
            TenantContext::constrain($sub, $parentTable . '.company_id');
        });
    }
}
