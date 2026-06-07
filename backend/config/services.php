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

    'openrouter' => [
        'key' => env('OPENROUTER_API_KEY'),
        'url' => env('OPENROUTER_API_URL', 'https://openrouter.ai/api/v1/chat/completions'),
        'image_model' => env('OPENROUTER_IMAGE_MODEL', 'openai/gpt-5.4-image-2'),
    ],

    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'moderation_url' => env('OPENAI_MODERATION_URL', 'https://api.openai.com/v1/moderations'),
        'moderation_model' => env('OPENAI_MODERATION_MODEL', 'omni-moderation-latest'),
    ],

    'stripe' => [
        'secret' => env('STRIPE_SECRET_KEY'),
        'publishable' => env('STRIPE_PUBLISHABLE_KEY'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'success_url' => env('STRIPE_SUCCESS_URL', 'https://vibyra.app/billing/success'),
        'cancel_url' => env('STRIPE_CANCEL_URL', 'https://vibyra.app/billing/cancel'),
        'portal_return_url' => env('STRIPE_PORTAL_RETURN_URL', 'https://vibyra.app/account'),
    ],

    'apple_iap' => [
        'shared_secret' => env('APPLE_IAP_SHARED_SECRET'),
        'verify_url' => env('APPLE_IAP_VERIFY_URL', 'https://buy.itunes.apple.com/verifyReceipt'),
        'sandbox_url' => env('APPLE_IAP_SANDBOX_URL', 'https://sandbox.itunes.apple.com/verifyReceipt'),
    ],

    'google_iap' => [
        'package_name' => env('GOOGLE_IAP_PACKAGE_NAME'),
        'service_account_json' => env('GOOGLE_IAP_SERVICE_ACCOUNT_JSON'),
    ],

    'railway' => [
        'api_token' => env('RAILWAY_API_TOKEN'),
        'cli_path' => env('RAILWAY_CLI_PATH', 'railway'),
        'team_id' => env('RAILWAY_WORKSPACE_ID', env('RAILWAY_TEAM_ID')),
        'default_region' => env('RAILWAY_DEFAULT_REGION'),
        'runtime_environment' => env('RAILWAY_RUNTIME_ENVIRONMENT', 'production'),
        'runtime_project_prefix' => env('RAILWAY_RUNTIME_PROJECT_PREFIX', 'vibyra-demo'),
        'runtime_ready_timeout' => env('RAILWAY_RUNTIME_READY_TIMEOUT', 180),
        'max_active_demos_per_user' => env('RAILWAY_MAX_ACTIVE_DEMOS_PER_USER', 1),
    ],

    'maxmind' => [
        'account_id' => env('MAXMIND_ACCOUNT_ID'),
        'license_key' => env('MAXMIND_LICENSE_KEY'),
        'database_path' => env('MAXMIND_DATABASE_PATH', storage_path('app/maxmind/GeoLite2-City.mmdb')),
        'update_days' => (int) env('MAXMIND_UPDATE_DAYS', 7),
    ],

];
