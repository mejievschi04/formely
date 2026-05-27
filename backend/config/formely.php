<?php

return [

    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:5173')), '/'),

    'mail_from_name' => env('MAIL_FROM_NAME', env('APP_NAME', 'Formely')),

];
