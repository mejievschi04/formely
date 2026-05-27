<?php

namespace App\Models;

use App\Casts\SafeJsonArray;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Exam extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'created_by',
        'module_id',
        'lesson_id',
        'title',
        'description',
        'status',
        'max_score',
        'passing_score',
        'time_limit_minutes',
        'max_attempts',
        'is_required',
        'unlock_after_completion',
        'unlock_target_id',
        'unlock_target_type',
        'question_types',
        'settings',
        'attempts_count',
        'passes_count',
        'average_score',
    ];

    protected $casts = [
        'question_types' => SafeJsonArray::class,
        'settings' => SafeJsonArray::class,
        'is_required' => 'boolean',
        'unlock_after_completion' => 'boolean',
        'average_score' => 'decimal:2',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function module()
    {
        return $this->belongsTo(Module::class);
    }

    public function lesson()
    {
        return $this->belongsTo(Lesson::class);
    }


    public function questions()
    {
        return $this->hasMany(ExamQuestion::class)->orderBy('order');
    }

    public function results()
    {
        return $this->hasMany(ExamResult::class);
    }

    /**
     * Vizibilitate pentru elevi (catalog / acces fără curs).
     * Setări din admin: access_mode + selected_students.
     */
    public function isVisibleToLearner(User $user): bool
    {
        $settings = is_array($this->settings) ? $this->settings : [];
        $mode = $settings['access_mode'] ?? 'all_students';
        if ($mode === 'selected_students') {
            $ids = array_map('intval', (array) ($settings['selected_students'] ?? []));

            return in_array((int) $user->id, $ids, true);
        }

        return true;
    }
}
