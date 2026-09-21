<?php

namespace App\Support;

use App\Models\Company;
use Illuminate\Support\Facades\Cache;

class DefaultCompany
{
    public static function id(): ?int
    {
        $slug = (string) config('formely.default_company_slug', 'default');

        return Cache::remember("company_id_slug_{$slug}", 300, function () use ($slug) {
            $id = Company::query()->where('slug', $slug)->value('id');

            return $id ? (int) $id : null;
        });
    }
}
