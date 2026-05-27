<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Event extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'short_description',
        'type', // live_online, physical, webinar, workshop
        'status', // draft, published, upcoming, live, completed, cancelled
        'start_date',
        'end_date',
        'timezone',
        'location',
        'live_link',
        'max_capacity',
        'instructor_id',
        'access_type', // free, paid, course_included
        'price',
        'currency',
        'course_id',
        'replay_url',
        'registrations_count',
        'attendance_count',
        'replay_views_count',
        'thumbnail',
    ];

    // Don't cast to datetime to avoid timezone conversions
    // We'll handle datetime as strings
    protected $casts = [
        'price' => 'decimal:2',
        'max_capacity' => 'integer',
        'registrations_count' => 'integer',
        'attendance_count' => 'integer',
        'replay_views_count' => 'integer',
        // 'start_date' => 'datetime', // Removed to avoid timezone conversion
        // 'end_date' => 'datetime',   // Removed to avoid timezone conversion
    ];

    /**
     * Get the instructor/speaker for this event
     */
    public function instructor()
    {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    /**
     * Get the course this event is included in (if any)
     */
    public function course()
    {
        return $this->belongsTo(Course::class, 'course_id');
    }

    /**
     * Get all users registered/attended this event
     */
    public function users()
    {
        return $this->belongsToMany(User::class, 'event_user')
            ->withPivot('registered', 'attended', 'watched_replay', 'registered_at', 'attended_at', 'replay_watched_at', 'notes')
            ->withTimestamps();
    }

    /**
     * Get registered users
     */
    public function registeredUsers()
    {
        return $this->belongsToMany(User::class, 'event_user')
            ->wherePivot('registered', true)
            ->withPivot('registered_at', 'attended', 'attended_at')
            ->withTimestamps();
    }

    /**
     * Get users who attended
     */
    public function attendedUsers()
    {
        return $this->belongsToMany(User::class, 'event_user')
            ->wherePivot('attended', true)
            ->withPivot('attended_at')
            ->withTimestamps();
    }

    /**
     * Calculate registration rate
     */
    public function getRegistrationRateAttribute()
    {
        if (!$this->max_capacity || $this->max_capacity == 0) {
            return null;
        }
        return round(($this->registrations_count / $this->max_capacity) * 100, 1);
    }

    /**
     * Calculate attendance rate
     */
    public function getAttendanceRateAttribute()
    {
        if ($this->registrations_count == 0) {
            return null;
        }
        return round(($this->attendance_count / $this->registrations_count) * 100, 1);
    }

    /**
     * Check if event is full
     */
    public function getIsFullAttribute()
    {
        if (!$this->max_capacity) {
            return false;
        }
        return $this->registrations_count >= $this->max_capacity;
    }

    /**
     * Check if event is upcoming
     */
    public function getIsUpcomingAttribute()
    {
        return in_array($this->status, ['published', 'upcoming']) && 
               strtotime($this->start_date) > time();
    }

    /**
     * Check if event is live
     */
    public function getIsLiveAttribute()
    {
        $now = time();
        $start = strtotime($this->start_date);
        $end = strtotime($this->end_date);
        return $this->status === 'live' || ($now >= $start && $now <= $end);
    }

    /**
     * Check if event is completed
     */
    public function getIsCompletedAttribute()
    {
        return $this->status === 'completed' || strtotime($this->end_date) < time();
    }

    /**
     * Update KPI counts
     */
    public function updateKPIs()
    {
        $this->registrations_count = $this->users()->wherePivot('registered', true)->count();
        $this->attendance_count = $this->users()->wherePivot('attended', true)->count();
        $this->replay_views_count = $this->users()->wherePivot('watched_replay', true)->count();
        $this->save();
    }
}

