<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Lead extends Model
{
    protected $fillable = [
        'name',
        'email',
        'company_name',
        'reason',
        'plan_interest',
        'message',
        'status',
        'source',
        'ip',
        'contacted_at',
        'privacy_accepted_at',
        'company_id',
    ];

    protected $casts = [
        'contacted_at' => 'datetime',
        'privacy_accepted_at' => 'datetime',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPlatformArray(): array
    {
        $source = (string) ($this->source ?? '');
        $fromSite = $source === '' || str_starts_with($source, 'website');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'company_name' => $this->company_name,
            'reason' => $this->reason,
            'plan_interest' => $this->plan_interest,
            'message' => $this->message,
            'status' => $this->status,
            'source' => $this->source,
            'source_label' => $fromSite ? 'Site' : $source,
            'company_id' => $this->company_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'contacted_at' => $this->contacted_at?->toIso8601String(),
            'privacy_accepted_at' => $this->privacy_accepted_at?->toIso8601String(),
        ];
    }
}
