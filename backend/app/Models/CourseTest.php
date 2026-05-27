<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * CourseTest Model (Pivot)
 * 
 * Links courses to tests with scope and rules
 */
class CourseTest extends Model
{
    use HasFactory;

    protected $table = 'course_test';

    protected $fillable = [
        'course_id',
        'test_id',
        'scope',
        'scope_id',
        'required',
        'passing_score',
        'order',
        'unlock_after_previous',
        'unlock_after_test_id',
    ];

    protected $casts = [
        'required' => 'boolean',
        'unlock_after_previous' => 'boolean',
    ];

    /**
     * Get the course
     */
    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    /**
     * Get the test
     */
    public function test()
    {
        return $this->belongsTo(Test::class);
    }

    /**
     * Get the scope entity (lesson or module)
     */
    public function scopeEntity()
    {
        if ($this->scope === 'lesson') {
            return $this->belongsTo(Lesson::class, 'scope_id');
        } elseif ($this->scope === 'module') {
            return $this->belongsTo(Module::class, 'scope_id');
        }
        
        return null;
    }
}

