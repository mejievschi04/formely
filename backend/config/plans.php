<?php

/**
 * Catalog planuri SaaS (sales-led). Sursă unică pentru limiți + feature flags + cote AI.
 * Website-ul oglindește volumele / AI progressive în copy.
 *
 * ai_credits: pool lunar (UTC month). null = nelimitat (fair use); 0 = fără consum.
 * Cost pe acțiune: config('ai.credit_costs').
 */
return [

    'instructor' => [
        'label' => 'Instructor',
        'max_active_learners' => 50,
        'max_staff' => 2,
        'features' => [
            'ai_creator' => true,
            'ai_builder' => false,
            'ai_tutor' => false,
            'ai_qa' => false,
            'ai_stats' => false,
            'ai_test_generation' => true,
            'library' => false,
            'events' => false,
            'analyst_role' => false,
        ],
        'ai_credits' => 100,
    ],

    'academie' => [
        'label' => 'Academie',
        'max_active_learners' => 250,
        'max_staff' => 6,
        'features' => [
            'ai_creator' => true,
            'ai_builder' => true,
            'ai_tutor' => false,
            'ai_qa' => true, // asistent admin Q&A (profil AI ales)
            'ai_stats' => false,
            'ai_test_generation' => true,
            'library' => true,
            'events' => true,
            'analyst_role' => true,
        ],
        'ai_credits' => 500,
    ],

    'business' => [
        'label' => 'Business',
        'max_active_learners' => null, // unlimited
        'max_staff' => 20,
        'features' => [
            'ai_creator' => true,
            'ai_builder' => true,
            'ai_tutor' => false, // fără tutor / study tools pe lecții
            'ai_qa' => true,
            'ai_stats' => true,
            'ai_test_generation' => true,
            'library' => true,
            'events' => true,
            'analyst_role' => true,
        ],
        'ai_credits' => 2500,
    ],

];
