<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
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

    public function lessonsProgress()
{
    return $this->belongsToMany(Lesson::class, 'lesson_progress')
                ->withPivot('completed')
                ->withTimestamps();
}

    public function conversationsAsUser1()
    {
        return $this->hasMany(Conversation::class, 'user1_id');
    }

    public function conversationsAsUser2()
    {
        return $this->hasMany(Conversation::class, 'user2_id');
    }

    public function conversations()
    {
        return Conversation::where('user1_id', $this->id)
            ->orWhere('user2_id', $this->id);
    }

    public function sentMessages()
    {
        return $this->hasMany(Message::class, 'sender_id');
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

    /** Admin, instructor sau analist (API + shell admin; drepturi diferite). */
    public function canAccessAdmin(): bool
    {
        return $this->isAdmin() || $this->isInstructor() || $this->isAnalyst();
    }
}
