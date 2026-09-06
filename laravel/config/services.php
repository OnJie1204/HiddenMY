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
        'url' => env('GEMINI_URL', 'https://generativelanguage.googleapis.com/v1beta'),

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
        'timeout' => 5,
    ],

    'nominatim' => [
        'url' => env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
        'timeout' => 5,
    ],

    'overpass' => [
        'url' => env('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
    ],

    'wikidata' => [
        'url' => env('WIKIDATA_URL', 'https://www.wikidata.org/w/api.php'),
        'timeout' => 5,
    ],

    'wikimedia' => [
        'file_url' => env('WIKIMEDIA_FILE_URL', 'https://commons.wikimedia.org/wiki/Special:FilePath'),
    ],

    'remote_images' => [
        'timeout' => 15,
    ],

    // Supabase Storage — all callers use the object-storage contract backed by
    // the Supabase adapter in app/Integrations/Storage.
    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'key' => env('SUPABASE_KEY'),
        'location_images_bucket' => env('SUPABASE_LOCATION_IMAGES_BUCKET', 'location_images'),
        'vote_photos_bucket' => env('SUPABASE_VOTE_PHOTOS_BUCKET', 'vote_photos'),
        'comment_photos_bucket' => env('SUPABASE_COMMENT_PHOTOS_BUCKET', 'comment_photos'),
        'post_images_bucket' => env('SUPABASE_POST_IMAGES_BUCKET', 'post_images'),
        'avatars_bucket' => env('SUPABASE_AVATARS_BUCKET', 'avatars'),
    ],

];
