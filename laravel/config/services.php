<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),

        // Model names are configurable so a Google deprecation or capacity
        // outage is a .env change, not a code deploy. Defaults are models
        // verified against the full Call A (grounded search) + Call B
        // (structured JSON + image) pipeline. Leave GEMINI_FALLBACK_MODEL
        // empty to disable model fallback.
        'model' => env('GEMINI_MODEL', 'gemini-3.6-flash'),
        'fallback_model' => env('GEMINI_FALLBACK_MODEL', 'gemini-flash-lite-latest'),
    ],

    // Photon (photon.komoot.io) — OpenStreetMap-based geocoder used for the
    // address type-ahead on the Submit / Edit Hidden Gem forms. Free, no API
    // key. Point PHOTON_URL at a self-hosted instance if the public one is
    // rate-limiting.
    'photon' => [
        'url' => env('PHOTON_URL', 'https://photon.komoot.io'),
    ],

    // Supabase Storage — where Hidden Gem / vote photos are uploaded. The
    // HiddenGemController uploads via raw env() calls; this mirror exists so
    // the achievement demo seeder can reuse the same bucket in a testable way.
    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'key' => env('SUPABASE_KEY'),
        'location_images_bucket' => env('SUPABASE_LOCATION_IMAGES_BUCKET', 'location_images'),
    ],

];
