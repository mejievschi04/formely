<?php

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class CompanyScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (TenantContext::denyTenantData()) {
            $builder->whereRaw('1 = 0');

            return;
        }

        if (! TenantContext::shouldScope()) {
            return;
        }

        $builder->where($model->getTable() . '.company_id', TenantContext::companyId());
    }
}
