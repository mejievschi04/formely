<?php

/**
 * Catalog planuri SaaS (sales-led). Sursă unică pentru limiți + feature flags.
 * Website-ul oglindește volumele / AI progressive în copy.
 */
return [

    'instructor' => [
        'label' => 'Instructor',
        'max_active_learners' => 50,
        'max_staff' => 2,
        'features' => [
            'ai_creator' => false,
            'ai_builder' => false,
            'ai_tutor' => false,
            'ai_qa' => false,
            'ai_stats' => false,
            'ai_test_generation' => false,
            'library' => false,
            'events' => false,
            'analyst_role' => false,
        ],
    ],

    'academie' => [
        'label' => 'Academie',
        'max_active_learners' => 250,
        'max_staff' => 6,
        'features' => [
            'ai_creator' => false,
            'ai_builder' => false,
            'ai_tutor' => false,
            'ai_qa' => false,
            'ai_stats' => false,
            'ai_test_generation' => true,
            'library' => true,
            'events' => true,
            'analyst_role' => true,
        ],
    ],

    'business' => [
        'label' => 'Business',
        'max_active_learners' => null, // unlimited
        'max_staff' => 20,
        'features' => [
            'ai_creator' => true,
            'ai_builder' => true,
            'ai_tutor' => true,
            'ai_qa' => true,
            'ai_stats' => true,
            'ai_test_generation' => true,
            'library' => true,
            'events' => true,
            'analyst_role' => true,
        ],
    ],

];
