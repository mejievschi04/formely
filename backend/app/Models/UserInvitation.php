<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class UserInvitation extends Model
{
    use BelongsToCompany;

    public ?string $runtimePlainToken = null;

    protected $hidden = [
        'token',
        'encrypted_token',
    ];

    protected $fillable = [
        'company_id',
        'email',
        'name',
        'role',
        'team_id',
        'token',
        'encrypted_token',
        'invited_by',
        'expires_at',
        'accepted_at',
        'email_status',
        'email_sent_at',
        'email_last_error',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
        'email_sent_at' => 'datetime',
    ];

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function isPending(): bool
    {
        return $this->accepted_at === null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function plainToken(): ?string
    {
        if (empty($this->encrypted_token)) {
            return null;
        }

        try {
            return Crypt::decryptString($this->encrypted_token);
        } catch (\Throwable) {
            return null;
        }
    }
}
