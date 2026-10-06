<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Support\UserRoles;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use App\Support\CourseUserPivot;
use App\Support\DirectorySearch;
use Illuminate\Database\Eloquent\Builder;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use BelongsToCompany, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'company_id',
        'name',
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

    /** Operator Formely (backoffice). Nu e rol în LMS. */
    public function isPlatformAdmin(): bool
    {
        return $this->company_id === null
            && UserRoles::isPlatformOperator($this->role);
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

    /** Nume, prenume sau email. Nu filtrează după echipă. */
    public function scopeWhereDirectorySearch(Builder $query, ?string $search): Builder
    {
        DirectorySearch::apply($query, $search);

        return $query;
    }

    public function assignedCourses() {
        return $this->belongsToMany(Course::class, 'course_user')
                    ->withPivot(CourseUserPivot::columns())
                    ->withTimestamps();
    }

    public function lessonsProgress()
{
    return $this->belongsToMany(Lesson::class, 'lesson_progress')
                ->withPivot('completed')
                ->withTimestamps();
}

    public function isAdmin(): bool
    {
        return ($this->role ?? '') === 'admin';
    }

    public function isInstructor(): bool
    {
        return ($this->role ?? '') === 'instructor';
    }

    public function isAnalyst(): bool
    {
        return ($this->role ?? '') === 'analyst';
    }

    /**
     * Admin și analist nu intră în tracking-ul de învățare/statistică.
     */
    public function isLearningActivityExempt(): bool
    {
        return in_array($this->role ?? '', ['admin', 'analyst'], true);
    }

}
