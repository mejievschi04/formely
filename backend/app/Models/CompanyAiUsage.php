<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyAiUsage extends Model
{
    protected $fillable = [
        'company_id',
        'period',
        'action',
        'used',
    ];

    protected function casts(): array
    {
        return [
            'used' => 'integer',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
