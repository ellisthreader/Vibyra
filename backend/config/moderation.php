<?php

return [
    'enabled' => env('MODERATION_ENABLED', true),
    'local_enabled' => env('LOCAL_MODERATION_ENABLED', true),
    // Remote moderation is operational company spend and requires a separate
    // budget before enabling; deterministic local moderation remains active.
    'remote_enabled' => env('OPENAI_MODERATION_ENABLED', false),
    'fail_closed' => env('OPENAI_MODERATION_FAIL_CLOSED', true),
    'timeout_seconds' => env('OPENAI_MODERATION_TIMEOUT', 12),
    'max_text_characters' => 12000,
    'max_image_data_url_characters' => 7000000,
    // legacy: verified email allowlist; bootstrap: consume each allowlisted
    // email once into an immutable user assignment; database: roles only.
    'privileged_role_mode' => env('VIBYRA_PRIVILEGED_ROLE_MODE', 'bootstrap'),
    'publish_reviewer_emails' => array_values(array_filter(array_map('trim', explode(',', env('VIBYRA_PUBLISH_REVIEWER_EMAILS', ''))))),
    // Emergency launch switch. This skips publish review decisions but leaves
    // bundle validation and preview sanitization active.
    'publish_review_temporarily_disabled' => env('PUBLISH_REVIEW_TEMPORARILY_DISABLED', false),
    // Explicit temporary testing switch. Hard deterministic/local moderation
    // denials still block publication even when this is enabled.
    'publish_force_approve_under_review' => env('PUBLISH_REVIEW_FORCE_APPROVE_UNDER_REVIEW', false),
    'publish_ai_review' => [
        // This is company-funded operational AI, so it stays off until a
        // separate operational budget and cap are configured.
        'enabled' => env('PUBLISH_REVIEW_AI_ENABLED', false),
        'model' => env('PUBLISH_REVIEW_AI_MODEL', 'openai/gpt-5.4-nano'),
        'min_score' => (int) env('PUBLISH_REVIEW_AI_MIN_SCORE', 35),
        'max_score' => (int) env('PUBLISH_REVIEW_AI_MAX_SCORE', 74),
        'max_input_characters' => (int) env('PUBLISH_REVIEW_AI_MAX_INPUT_CHARACTERS', 9000),
        'max_source_files' => (int) env('PUBLISH_REVIEW_AI_MAX_SOURCE_FILES', 24),
        'max_source_characters' => (int) env('PUBLISH_REVIEW_AI_MAX_SOURCE_CHARACTERS', 120000),
        'max_output_tokens' => (int) env('PUBLISH_REVIEW_AI_MAX_OUTPUT_TOKENS', 350),
        'timeout_seconds' => (int) env('PUBLISH_REVIEW_AI_TIMEOUT', 20),
        'approve_confidence' => (float) env('PUBLISH_REVIEW_AI_APPROVE_CONFIDENCE', 0.84),
        'deny_confidence' => (float) env('PUBLISH_REVIEW_AI_DENY_CONFIDENCE', 0.90),
        'approve_score' => (int) env('PUBLISH_REVIEW_AI_APPROVE_SCORE', 78),
    ],
    'block_message' => 'That input does not meet Vibyra PG community rules. Please rewrite it without profanity, hate, sexual content, harassment, spam, or obfuscated wording.',

    'thresholds' => [
        'harassment' => 0.45,
        'harassment/threatening' => 0.25,
        'hate' => 0.25,
        'hate/threatening' => 0.15,
        'illicit' => 0.55,
        'illicit/violent' => 0.30,
        'self-harm' => 0.35,
        'self-harm/intent' => 0.20,
        'self-harm/instructions' => 0.15,
        'sexual' => 0.20,
        'sexual/minors' => 0.01,
        'violence' => 0.65,
        'violence/graphic' => 0.20,
    ],

    'blocked_terms' => [
        'profanity' => [
            'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'shitty',
            'bitch', 'bitches', 'bastard', 'asshole', 'arsehole', 'dickhead', 'prick',
            'cunt', 'twat', 'wanker', 'bollocks', 'piss off', 'stfu', 'wtf', 'gtfo',
            'screw you', 'go to hell', 'dumbass', 'jackass', 'dipshit', 'shithead',
            'slut', 'whore', 'skank', 'hoe', 'douchebag', 'crap', 'damn',
        ],
        'hate_or_slurs' => [
            'nigger', 'nigga', 'coon', 'spic', 'chink', 'gook', 'kike', 'kyke',
            'wetback', 'raghead', 'sand nigger', 'paki', 'towelhead', 'beaner',
            'jungle bunny', 'porch monkey', 'zipperhead', 'redskin', 'gypsy',
            'tranny', 'shemale', 'faggot', 'fag', 'dyke', 'homo', 'retard',
            'mongoloid', 'cripple', 'subhuman', 'white power', 'heil hitler',
            'gas the', 'race war', 'ethnic cleansing',
        ],
        'sexual' => [
            'porn', 'porno', 'pornography', 'xxx', 'nsfw', 'nude', 'nudes', 'nudity',
            'onlyfans', 'stripper', 'escort', 'prostitute', 'brothel', 'blowjob',
            'handjob', 'rimjob', 'deepthroat', 'anal', 'orgasm', 'cum', 'cumming',
            'semen', 'sperm', 'ejaculate', 'dildo', 'vibrator', 'fetish', 'bdsm',
            'bondage', 'sex chat', 'sext', 'sexting', 'hookup', 'send pics',
            'send nudes', 'dick pic', 'boobs', 'tits', 'pussy', 'vagina', 'penis',
            'cock', 'ballsack', 'scrotum', 'clit', 'nipple', 'horny', 'masturbate',
            'jerk off', 'wank off', 'finger me', 'suck me', '69', 'sex', 'sexual',
            'sexy', 'erotic', 'erotica', 'explicit', 'adult content', 'adult pics',
            'adult video', 'dirty pics', 'dirty talk', 'lap dance', 'strip tease',
            'striptease', 'threesome', 'orgy', 'hentai', 'camgirl', 'cam boy',
            'webcam sex', 'phone sex', 'roleplay sex', 'seduce me',
        ],
        'sexual_minors' => [
            'child porn', 'child pornography', 'csam', 'underage porn',
            'underage nudes', 'minor nudes', 'minor porn', 'teen nudes',
            'teen porn', 'loli', 'lolicon', 'shota', 'shotacon',
            'sexual images of children', 'explicit images of children',
            'nude child', 'nude children', 'child sexual abuse',
        ],
        'non_pg_or_violence' => [
            'gore', 'gory', 'decapitate', 'beheading', 'dismember', 'bloodbath',
            'torture', 'rape', 'rapist', 'molest', 'molester', 'pedophile',
            'paedophile', 'incest', 'bestiality', 'necrophilia', 'kill yourself',
            'kys', 'suicide instructions', 'self harm instructions',
        ],
        'spam' => [
            'click here', 'free money', 'earn money fast', 'work from home',
            'limited time offer', 'act now', 'risk free', 'guaranteed winner',
            'winner selected', 'claim your prize', 'promo code', 'discount code',
            'buy followers', 'follow for follow', 'like and subscribe',
            'telegram me', 'whatsapp me', 'crypto giveaway', 'airdrop',
            'double your bitcoin', 'investment opportunity', 'loan approved',
            'visit my profile', 'dm me now', 'cheap pills', 'casino bonus',
            'adult dating', 'hot singles', 'copy paste this',
        ],
    ],

    'blocked_patterns' => [
        ['category' => 'profanity_obfuscation', 'pattern' => '/\bf+[^a-z0-9]*[u*@]?[^a-z0-9]*c+[^a-z0-9]*k+\b/iu'],
        ['category' => 'profanity_obfuscation', 'pattern' => '/\bf+\W*[u*@]\W*c+\W*k+\b/iu'],
        ['category' => 'profanity_obfuscation', 'pattern' => '/\bs+\W*h+\W*[i!1|]\W*t+\b/iu'],
        ['category' => 'profanity_obfuscation', 'pattern' => '/\bb+\W*[i!1|]\W*t+\W*c+\W*h+\b/iu'],
        ['category' => 'profanity_obfuscation', 'pattern' => '/\bc+\W*[u*@]\W*n+\W*t+\b/iu'],
        ['category' => 'sexual_minors', 'pattern' => '/\b(?:under\s*age|underage|minor|child|children|teen)\b.{0,28}\b(?:nudes?|porn|xxx|explicit|sexual|pics?|images?|videos?)\b/iu'],
        ['category' => 'sexual_minors', 'pattern' => '/\b(?:c+[^a-z0-9]*p+|c+[^a-z0-9]*s+[^a-z0-9]*a+[^a-z0-9]*m+)\b.{0,24}\b(?:porn|pics?|images?|videos?|content|links?)\b/iu'],
        ['category' => 'sexual_obfuscation', 'pattern' => '/\bp+\W*[o0]\W*r+\W*n+\b/iu'],
        ['category' => 'sexual_obfuscation', 'pattern' => '/\bn+\W*[u*@]\W*d+\W*e+\W*s+\b/iu'],
        ['category' => 'sexual_obfuscation', 'pattern' => '/\bs+[^a-z0-9]*[e3]?[^a-z0-9]*x+\b/iu'],
        ['category' => 'hate_obfuscation', 'pattern' => '/\bf+\W*[a@]\W*g+\W*g+\W*[o0]\W*t+\b/iu'],
        ['category' => 'hate_obfuscation', 'pattern' => '/(?:^|[^a-z0-9])[_\W]*n?[_\W]*[i!1|][_\W]*g+[_\W]*g+[_\W]*[a@](?:[^a-z0-9]|$)/iu'],
        ['category' => 'hate_obfuscation', 'pattern' => '/(?:^|[^a-z0-9])n+[^a-z0-9]*[i!1|]+[^a-z0-9]*g+[^a-z0-9]*g+[^a-z0-9]*(?:e|3)+[^a-z0-9]*r+(?:[^a-z0-9]|$)/iu'],
        ['category' => 'spam', 'pattern' => '/(?:https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|discord\.gg\/).*(?:https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|discord\.gg\/)/iu'],
        ['category' => 'spam', 'pattern' => '/\b(?:buy|cheap|free|earn|claim|winner|prize)\b.{0,40}\b(?:now|today|money|crypto|followers|pills|bonus)\b/iu'],
        ['category' => 'emoji_sexual_evasion', 'pattern' => '/(?:\x{1F346}|\x{1F351}).{0,12}(?:\x{1F4A6}|\x{1F445}|\x{1F444})/u'],
    ],
];
