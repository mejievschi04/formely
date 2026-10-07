<?php

return [

    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:5173')), '/'),

    /** URL LMS (prima valoare din FRONTEND_URL dacă e listă CORS). */
    'lms_url' => rtrim((string) (env('FORMELY_LMS_URL') ?: trim(explode(',', (string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:5173')))[0])), '/'),

    /** Zile până expiră invitația utilizator (email). */
    'invitation_expire_days' => (int) env('INVITATION_EXPIRE_DAYS', 7),

    'mail_from_name' => env('MAIL_FROM_NAME', env('APP_NAME', 'Formely')),

    /** Slug companie implicită (login branding, migrare date existente). */
    'default_company_slug' => env('FORMELY_DEFAULT_COMPANY_SLUG', 'default'),

    /**
     * Register public: pe company default (sandbox demo).
     * Post-vânzare: owner vine prin invitație. Default off (sales-led).
     */
    'public_register_enabled' => filter_var(env('FORMELY_PUBLIC_REGISTER_ENABLED', false), FILTER_VALIDATE_BOOL),

    'leads_notify_email' => env('FORMELY_LEADS_NOTIFY_EMAIL', env('MAIL_FROM_ADDRESS', 'contact@formely.org')),

    /** URL backoffice operatori Formely. */
    'backoffice_url' => rtrim((string) env('FORMELY_BACKOFFICE_URL', 'http://localhost:5180'), '/'),
    'trial_days' => max(1, (int) env('FORMELY_TRIAL_DAYS', 15)),

];
