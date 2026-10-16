<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StartAiCourseGenerationRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'request_key' => 'required|uuid',
            'prompt' => 'required|string|max:20000',
            // Editing existing courses continues to use the builder's operation plan.
            'courseId' => 'prohibited',
            'guided_brief' => 'required|array',
            'guided_brief.topic' => 'required|string|max:2000',
            'guided_brief.target_audience' => 'required|string|max:1000',
            'guided_brief.level' => 'required|in:incepator,mediu,avansat',
            'guided_brief.style' => 'required|in:practic,teoretic,mixt',
            'guided_brief.lesson_size' => 'required|in:scurt,mediu,detaliat',
            'guided_brief.language' => 'required|in:ro,en,ru',
            'guided_brief.modules_count' => 'required|integer|min:2|max:12',
            'guided_brief.lessons_per_module' => 'required|integer|min:2|max:8',
            'guided_brief.evaluation' => 'required|in:none',
            'guided_brief.course_title' => 'nullable|string|max:2000',
            'guided_brief.description' => 'nullable|string|max:5000',
            'source_text' => 'nullable|string|max:12000',
            'attachments' => 'nullable|array|max:10',
            'attachments.*' => 'array',
            'attachments.*.name' => 'required|string|max:255',
            'attachments.*.text' => 'required|string|max:120000',
        ];
    }
}
