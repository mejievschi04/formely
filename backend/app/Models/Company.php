<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Company extends Model
{
    use HasFactory;

    public const PLAN_INSTRUCTOR = 'instructor';

    public const PLAN_ACADEMIE = 'academie';

    public const PLAN_BUSINESS = 'business';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_TRIAL = 'trial';

    public const STATUS_SUSPENDED = 'suspended';

    protected $fillable = [
        'name',
        'slug',
        'logo_path',
        'primary_color',
        'secondary_color',
        'status',
        'plan',
        'max_active_learners',
        'max_staff',
        'features',
        'trial_ends_at',
        'contract_ends_at',
        'notes',
    ];

    protected $casts = [
        'features' => 'array',
        'trial_ends_at' => 'datetime',
        'contract_ends_at' => 'datetime',
        'max_active_learners' => 'integer',
        'max_staff' => 'integer',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class);
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class);
    }

    public function isSuspended(): bool
    {
        return ($this->status ?? self::STATUS_ACTIVE) === self::STATUS_SUSPENDED;
    }

    public function isTrialExpired(): bool
    {
        if (($this->status ?? self::STATUS_ACTIVE) !== self::STATUS_TRIAL) {
            return false;
        }

        return $this->trial_ends_at !== null && $this->trial_ends_at->lt(now());
    }

    public function isUsable(): bool
    {
        if ($this->isSuspended() || $this->isTrialExpired()) {
            return false;
        }

        return in_array($this->status ?? self::STATUS_ACTIVE, [self::STATUS_ACTIVE, self::STATUS_TRIAL], true);
    }

    public function logoUrl(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return '/storage/' . ltrim($this->logo_path, '/');
    }

    /** @return array<string, mixed> */
    public function brandingPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'logo_url' => $this->logoUrl(),
            'primary_color' => $this->primary_color ?? '#0891b2',
            'secondary_color' => $this->secondary_color ?? '#22d3ee',
            'plan' => $this->plan,
            'status' => $this->status,
        ];
    }

    public function deleteLogoFile(): void
    {
        if ($this->logo_path) {
            try {
                Storage::disk('public')->delete($this->logo_path);
            } catch (\Throwable) {
                // ignore
            }
        }
    }
}
