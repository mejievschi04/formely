<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegistrationInvitation extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id',
        'email',
        'token',
        'name',
        'role',
        'team_id',
        'invited_by',
        'user_id',
        'expires_at',
        'accepted_at',
        'encrypted_token',
        'email_status',
        'email_sent_at',
        'email_last_error',
        'reminder_sent_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
        'email_sent_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
    ];

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isAccepted(): bool
    {
        return $this->accepted_at !== null;
    }

}
