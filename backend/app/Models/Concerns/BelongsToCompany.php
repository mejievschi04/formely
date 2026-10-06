<?php

namespace App\Models\Concerns;

use App\Models\Company;
use App\Models\Scopes\CompanyScope;
use App\Support\DefaultCompany;
use App\Support\TenantContext;
use App\Support\UserRoles;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope(new CompanyScope);

        static::creating(function ($model) {
            if (! empty($model->company_id)) {
                return;
            }

            if (TenantContext::shouldScope()) {
                $model->company_id = TenantContext::companyId();

                return;
            }

            // Operatorul platformei nu aparține niciunei academii.
            if ($model instanceof \App\Models\User && UserRoles::isPlatformOperator($model->role)) {
                return;
            }

            // Fără tenant în context (CLI, joburi, seed-uri): rândul aparține academiei implicite,
            // nu rămâne orfan și invizibil pentru toate academiile.
            if (! TenantContext::denyTenantData()) {
                $model->company_id = DefaultCompany::id();
            }
        });
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
