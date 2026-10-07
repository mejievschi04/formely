<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Lead extends Model
{
    protected $fillable = [
        'name',
        'email',
        'phone',
        'company_name',
        'reason',
        'plan_interest',
        'message',
        'status',
        'source',
        'attribution',
        'ip',
        'contacted_at',
        'privacy_accepted_at',
        'company_id',
    ];

    protected $casts = [
        'contacted_at' => 'datetime',
        'privacy_accepted_at' => 'datetime',
        'attribution' => 'array',
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
        $utm = $this->attribution ?? [];
        $label = $fromSite ? 'Site' : $source;
        if (! empty($utm['utm_source'])) {
            $label = trim($utm['utm_source'].(empty($utm['utm_campaign']) ? '' : ' · '.$utm['utm_campaign']));
        } elseif (! empty($utm['fbclid'])) {
            $label = 'Meta';
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company_name' => $this->company_name,
            'reason' => $this->reason,
            'plan_interest' => $this->plan_interest,
            'message' => $this->message,
            'status' => $this->status,
            'source' => $this->source,
            'source_label' => $label,
            'attribution' => $utm ?: null,
            'company_id' => $this->company_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'contacted_at' => $this->contacted_at?->toIso8601String(),
            'privacy_accepted_at' => $this->privacy_accepted_at?->toIso8601String(),
        ];
    }
}
