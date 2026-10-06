<?php

return [

    // FRONTEND_URL poate fi o listă separată prin virgulă (CORS); linkurile din emailuri folosesc prima adresă.
    // Formely: FORMELY_LMS_URL, dacă e setat, are prioritate (LMS-ul e doar unul dintre domeniile din CORS).
    'frontend_url' => rtrim(trim((string) (env('FORMELY_LMS_URL') ?: explode(',', (string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:5173')))[0])), '/'),

    'mail_from_name' => env('MAIL_FROM_NAME', env('APP_NAME', 'Formely')),

    // Folderul backup-urilor LMS (baza de date + storage/app/public)
    'backup_root' => storage_path('app/lms-backups'),

];
