<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

class AiCourseGeneration extends Model
{
    use BelongsToCompany;

    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = [
        'input' => 'array', 'outline' => 'array', 'lessons' => 'array', 'result' => 'array',
        'completed_lessons' => 'integer', 'total_lessons' => 'integer',
    ];

    public function snapshot(): array
    {
        return [
            'generation_id' => $this->id,
            'status' => $this->status,
            'course_title' => $this->outline['title'] ?? $this->input['guided_brief']['topic'] ?? null,
            'completed_lessons' => $this->completed_lessons,
            'total_lessons' => $this->total_lessons,
            'phase' => $this->outline === null ? 'outline' : ($this->completed_lessons < $this->total_lessons ? 'lessons' : 'saving'),
            'error' => $this->error,
            'result' => $this->result,
        ];
    }
}
