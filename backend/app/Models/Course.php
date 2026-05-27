<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model; // <--- trebuie adăugat
use App\Models\User; // pentru relația teacher
use App\Models\Module; // pentru relația modules
use App\Models\Concerns\InvalidatesTutorKnowledgeCache;
use App\Jobs\SyncAiKnowledgeJob;
use Illuminate\Support\Facades\Storage;

class Course extends Model
{
    use HasFactory;
    use InvalidatesTutorKnowledgeCache;

    protected $fillable = [
        'list_order',
        'title',
        'description',
        'category',
        'level',
        'status',
        'workflow_status',
        'teacher_id',
        'image',
        'card_color',
        'reward_points',
        // Settings stored as JSON for modularity
        'settings',
        // Legacy fields (kept for backward compatibility, will be migrated to settings)
        'short_description',
        'access_type',
        'enrollment_type',
        'price',
        'currency',
        'objectives',
        'requirements',
        'estimated_duration_hours',
        'sequential_unlock',
        'min_completion_percentage',
        'meta_title',
        'meta_description',
        'meta_keywords',
        'marketing_tags',
        'has_certificate',
        'min_test_score',
        'min_exam_score', // Legacy - some migrations use this name
        'allow_retake',
        'max_retakes',
        'drip_content',
        'drip_schedule',
        'comments_enabled',
        'visibility',
        'permissions',
    ];

    protected $casts = [
        'settings' => 'array',
        'objectives' => 'array',
        'requirements' => 'array',
        'meta_keywords' => 'array',
        'marketing_tags' => 'array',
        'permissions' => 'array',
        'price' => 'decimal:2',
        'sequential_unlock' => 'boolean',
        'has_certificate' => 'boolean',
        'allow_retake' => 'boolean',
        'drip_content' => 'boolean',
        'comments_enabled' => 'boolean',
        'total_revenue' => 'decimal:2',
        'average_rating' => 'decimal:2',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = ['image_url'];

    /**
     * Get the full URL for the course image
     * Returnează URL relativ /storage/... - frontend-ul îl transformă în absolut cu origin-ul curent
     */
    public function getImageUrlAttribute(): ?string
    {
        if ($this->image === null || $this->image === '') {
            return null;
        }

        $raw = trim((string) $this->image);
        if ($raw === '') {
            return null;
        }

        if (filter_var($raw, FILTER_VALIDATE_URL)) {
            return $raw;
        }

        $path = ltrim($raw, '/');
        // Evită /storage/storage/... dacă în DB e deja prefixat greșit
        if (str_starts_with($path, 'storage/')) {
            return '/' . $path;
        }

        return '/storage/' . $path;
    }

    public function modules() {
        return $this->hasMany(Module::class)->orderBy('order');
    }

    public function lessons() {
        return $this->hasMany(Lesson::class)->orderBy('order');
    }

    /**
     * Get tests linked to this course via pivot table
     */
    public function tests() {
        return $this->belongsToMany(Test::class, 'course_test')
            ->withPivot('scope', 'scope_id', 'required', 'passing_score', 'order', 'unlock_after_previous', 'unlock_after_test_id')
            ->withTimestamps();
    }

    /**
     * Get course-test relationships
     */
    public function courseTests() {
        return $this->hasMany(CourseTest::class);
    }

    /**
     * Get course settings (access, drip, certificate)
     */
    public function getSettingsAttribute($value)
    {
        $settings = is_array($value) ? $value : (is_string($value) ? json_decode($value, true) : []) ?? [];
        
        // Merge with legacy fields for backward compatibility
        $defaults = [
            'access' => [
                'type' => $this->attributes['access_type'] ?? 'free',
                'price' => isset($this->attributes['price']) ? (float)$this->attributes['price'] : 0,
                'currency' => $this->attributes['currency'] ?? 'RON',
            ],
            'drip' => [
                'enabled' => isset($this->attributes['drip_content']) ? (bool)$this->attributes['drip_content'] : false,
                'schedule' => $this->attributes['drip_schedule'] ?? null,
            ],
            'certificate' => [
                'enabled' => isset($this->attributes['has_certificate']) ? (bool)$this->attributes['has_certificate'] : false,
                'min_score' => isset($this->attributes['min_test_score']) ? (int)$this->attributes['min_test_score'] : 70,
                'allow_retake' => isset($this->attributes['allow_retake']) ? (bool)$this->attributes['allow_retake'] : true,
                'max_retakes' => isset($this->attributes['max_retakes']) ? (int)$this->attributes['max_retakes'] : 3,
            ],
        ];
        
        // Merge settings, with user settings taking precedence
        return array_replace_recursive($defaults, $settings);
    }

    /**
     * Set course settings
     */
    public function setSettingsAttribute($value)
    {
        if (is_array($value)) {
            $this->attributes['settings'] = json_encode($value);
        } else {
            $this->attributes['settings'] = $value;
        }
    }

    public function teacher() {
        return $this->belongsTo(User::class, 'teacher_id');
    }


    public function teams() {
        return $this->belongsToMany(Team::class);
    }

    public function assignedUsers() {
        return $this->belongsToMany(User::class, 'course_user')
                    ->withPivot('is_mandatory', 'assigned_at', 'enrolled', 'enrolled_at', 'started_at', 'completed_at', 'progress_percentage')
                    ->withTimestamps();
    }

    /**
     * Mapele de curs în care apare acest curs.
     */
    public function courseMaps()
    {
        return $this->belongsToMany(CourseMap::class, 'course_map_course')
            ->withPivot('order')
            ->withTimestamps();
    }

    protected static function boot()
    {
        parent::boot();

        static::saved(function (self $course) {
            self::clearTutorKnowledgeCache((int) $course->id);
            SyncAiKnowledgeJob::dispatch(null, (int) $course->id, 'sync')->onConnection('background');
        });

        static::deleted(function (self $course) {
            self::clearTutorKnowledgeCache((int) $course->id);
            SyncAiKnowledgeJob::dispatch(null, (int) $course->id, 'sync')->onConnection('background');
        });
    }
}
