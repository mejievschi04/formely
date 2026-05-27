<?php

/**
 * Rate limits for /api/messages/* (citiri vs scrieri separate).
 * Folosește config() ca să funcționeze corect cu `php artisan config:cache`.
 */
return [
    'read_per_minute' => max(120, (int) env('FORMELY_MESSAGES_READ_PER_MINUTE', 2000)),
    'write_per_minute' => max(30, (int) env('FORMELY_MESSAGES_WRITE_PER_MINUTE', 180)),
];
