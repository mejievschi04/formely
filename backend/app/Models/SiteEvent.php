<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eveniment anonim de pe site-ul de marketing (vizită, click CTA, formular, cerere).
 * `visitor` e un hash zilnic din IP + browser; IP-ul nu se salvează.
 */
class SiteEvent extends Model
{
    public const UPDATED_AT = null;

    public const TYPES = ['pageview', 'cta_click', 'form_start', 'lead'];

    protected $fillable = [
        'type',
        'visitor',
        'path',
        'source',
        'utm_medium',
        'utm_campaign',
        'device',
        'lang',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
