<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EnrollmentAssignment extends Model
{
    use BelongsToCompany, HasFactory;

    public const TYPE_COURSE = 'course';

    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_TEAM = 'team';

    public const SOURCE_DEPARTMENT = 'department';

    public const SOURCE_ROLE = 'role';

    public const SOURCE_COMPANY = 'company';

    public const SOURCE_RULE = 'rule';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_REVOKED = 'revoked';

    protected $fillable = [
        'company_id',
        'assignable_type',
        'course_id',
        'learning_path_id',
        'source_type',
        'source_team_id',
        'source_department_id',
        'source_role',
        'user_id',
        'is_mandatory',
        'due_at',
        'assigned_by',
        'assigned_at',
        'status',
        'metadata',
    ];

    protected $casts = [
        'is_mandatory' => 'boolean',
        'due_at' => 'datetime',
        'assigned_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function sourceTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'source_team_id');
    }

    public function sourceDepartment(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'source_department_id');
    }

    public function isActive(): bool
    {
        return strtolower((string) ($this->status ?? '')) === self::STATUS_ACTIVE;
    }
}
