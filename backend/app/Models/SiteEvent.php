<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eveniment anonim de pe site-ul de marketing (vizită, secțiune, click, formular, cerere).
 * `visitor` e un hash zilnic din IP + browser; IP-ul nu se salvează.
 * `label` e numele secțiunii sau textul butonului, fără date despre persoană.
 */
class SiteEvent extends Model
{
    public const UPDATED_AT = null;

    public const TYPES = ['pageview', 'section_view', 'cta_click', 'demo_click', 'form_start', 'lead'];

    protected $fillable = [
        'type',
        'visitor',
        'path',
        'label',
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
