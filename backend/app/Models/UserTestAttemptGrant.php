<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserTestAttemptGrant extends Model
{
    protected $fillable = [
        'user_id',
        'test_id',
        'course_id',
        'extra_attempts',
        'granted_by',
    ];

    protected $casts = [
        'extra_attempts' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function test()
    {
        return $this->belongsTo(Test::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function grantedBy()
    {
        return $this->belongsTo(User::class, 'granted_by');
    }
}
