<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Support\UserRoles;
use App\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Passwords\CanResetPassword;
use Illuminate\Contracts\Auth\CanResetPassword as CanResetPasswordContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements CanResetPasswordContract
{
    use BelongsToCompany, CanResetPassword, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'company_id',
        'name',
        'job_title',
        'email',
        'password',
        'avatar',
        'bio',
        'level',
        'points',
        'role',
        'must_change_password',
        'status',
        'permissions',
        'last_login_at',
        'last_activity_at',
        'suspended_reason',
        'suspended_until',
    ];

    protected $casts = [
        'permissions' => 'array',
        'last_login_at' => 'datetime',
        'last_activity_at' => 'datetime',
        'suspended_until' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function courses() {
        return $this->hasMany(Course::class, 'teacher_id');
    }

    public function events() {
        return $this->hasMany(Event::class, 'instructor_id');
    }

    public function teams() {
        return $this->belongsToMany(Team::class);
    }

    public function assignedCourses() {
        return $this->belongsToMany(Course::class, 'course_user')
                    ->withPivot('is_mandatory', 'assigned_at', 'enrolled', 'enrolled_at', 'started_at', 'completed_at', 'progress_percentage')
                    ->withTimestamps();
    }

    public function enrollmentAssignments()
    {
        return $this->hasMany(EnrollmentAssignment::class);
    }

    public function lessonsProgress()
{
    return $this->belongsToMany(Lesson::class, 'lesson_progress')
                ->withPivot('completed')
                ->withTimestamps();
}

    public function normalizedRole(): string
    {
        return UserRoles::normalize($this->role);
    }

    public function roleLabel(): string
    {
        return UserRoles::label($this->role);
    }

    /** Operator Formely (backoffice). Nu e rol în LMS. */
    public function isPlatformAdmin(): bool
    {
        return $this->company_id === null
            && UserRoles::isPlatformOperator($this->role);
    }

    public function isCompanyOwner(): bool
    {
        return in_array($this->role ?? '', [UserRoles::COMPANY_OWNER, UserRoles::LEGACY_ADMIN], true);
    }

    public function isHrAdmin(): bool
    {
        return ($this->role ?? '') === UserRoles::HR_ADMIN;
    }

    public function isManager(): bool
    {
        return ($this->role ?? '') === UserRoles::MANAGER;
    }

    public function isEmployee(): bool
    {
        return in_array($this->role ?? '', [UserRoles::LEGACY_STUDENT, UserRoles::EMPLOYEE], true);
    }

    /** Admin academie (owner sau legacy admin). Operatorii platformei nu sunt admin LMS. */
    public function isAdmin(): bool
    {
        return $this->isCompanyOwner();
    }

    public function isInstructor(): bool
    {
        return ($this->role ?? '') === UserRoles::INSTRUCTOR;
    }

    public function isAnalyst(): bool
    {
        return ($this->role ?? '') === UserRoles::ANALYST;
    }

    public function isLearningActivityExempt(): bool
    {
        return in_array($this->normalizedRole(), [
            UserRoles::COMPANY_OWNER,
            UserRoles::HR_ADMIN,
            UserRoles::MANAGER,
            UserRoles::ANALYST,
        ], true);
    }

    public function canAccessAdmin(): bool
    {
        return in_array($this->normalizedRole(), [
            UserRoles::COMPANY_OWNER,
            UserRoles::HR_ADMIN,
            UserRoles::MANAGER,
            UserRoles::INSTRUCTOR,
            UserRoles::ANALYST,
        ], true);
    }

    public function canMutateInAdmin(): bool
    {
        return match ($this->normalizedRole()) {
            UserRoles::ANALYST, UserRoles::MANAGER => false,
            UserRoles::INSTRUCTOR => true,
            UserRoles::COMPANY_OWNER, UserRoles::HR_ADMIN => true,
            default => false,
        };
    }

    public function canManageUsers(): bool
    {
        return in_array($this->normalizedRole(), [
            UserRoles::COMPANY_OWNER,
            UserRoles::HR_ADMIN,
        ], true);
    }

    public function canManageOrganization(): bool
    {
        return $this->canManageUsers();
    }

    public function canManagePlatformSettings(): bool
    {
        return in_array($this->normalizedRole(), [
            UserRoles::COMPANY_OWNER,
        ], true);
    }

    public function canEditCourses(): bool
    {
        return in_array($this->normalizedRole(), [
            UserRoles::COMPANY_OWNER,
            UserRoles::INSTRUCTOR,
        ], true);
    }

    /** @return array<string, bool> */
    public function adminPermissions(): array
    {
        return [
            'can_access_admin' => $this->canAccessAdmin(),
            'can_mutate_admin' => $this->canMutateInAdmin(),
            'can_manage_users' => $this->canManageUsers(),
            'can_manage_organization' => $this->canManageOrganization(),
            'can_manage_settings' => $this->canManagePlatformSettings(),
            'can_edit_courses' => $this->canEditCourses(),
            'is_read_only_admin' => in_array($this->normalizedRole(), [
                UserRoles::ANALYST,
                UserRoles::MANAGER,
            ], true),
        ];
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    /**
     * Reactivează automat dacă suspendarea temporară a expirat.
     */
    public function clearExpiredSuspension(): bool
    {
        if (($this->status ?? 'active') !== 'suspended') {
            return false;
        }

        if ($this->suspended_until && $this->suspended_until->isPast()) {
            $this->forceFill([
                'status' => 'active',
                'suspended_reason' => null,
                'suspended_until' => null,
            ])->save();

            return true;
        }

        return false;
    }

    public function isSuspended(): bool
    {
        $this->clearExpiredSuspension();

        return ($this->status ?? 'active') === 'suspended';
    }

    public function isInactive(): bool
    {
        return ($this->status ?? 'active') === 'inactive';
    }

    public function isAccessBlocked(): bool
    {
        return $this->isSuspended() || $this->isInactive();
    }

    public function accessBlockedMessage(): string
    {
        if ($this->isInactive()) {
            return 'Contul tău este inactiv. Contactează administratorul pentru a fi reactivat.';
        }

        if ($this->isSuspended()) {
            return $this->suspensionLoginMessage();
        }

        return 'Accesul la cont este restricționat.';
    }

    public function suspensionLoginMessage(): string
    {
        $message = 'Contul tău este suspendat. Contactează administratorul pentru detalii.';

        if (! empty($this->suspended_reason)) {
            $message .= ' Motiv: ' . $this->suspended_reason;
        }

        if ($this->suspended_until && $this->suspended_until->isFuture()) {
            $message .= ' Suspendare până la: ' . $this->suspended_until
                ->timezone(config('app.timezone'))
                ->format('d.m.Y H:i');
        }

        return $message;
    }
}
