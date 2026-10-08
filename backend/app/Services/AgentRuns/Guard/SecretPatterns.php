<?php

namespace App\Services\AgentRuns\Guard;

/**
 * The shape of every secret SecretGuard recognises. The Rust twin
 * (desktop-tauri/src-tauri/crates/vibyra-core/src/secret_guard/patterns.rs) holds the same patterns; both are held to
 * docs/secret-guard-vectors.json. Keep the expressions inside the subset PCRE and Rust's `regex` share: no lookaround,
 * no backreferences, ASCII classes only (`\b` is ASCII here, written `(?-u:\b)` in Rust).
 */
final class SecretPatterns
{
    /** Whole-match replacements, applied in this order (a vendor key that also looks like another is named by the first). */
    public const TOKENS = [
        ['private_key', '/-----BEGIN [A-Z0-9 ]{0,30}PRIVATE KEY[A-Z ]{0,10}-----(?:.*?-----END [A-Z0-9 ]{0,30}PRIVATE KEY[A-Z ]{0,10}-----|.*)/s'],
        ['aws_access_key', '/\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/'],
        ['github_token', '/\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/'],
        ['anthropic_key', '/\bsk-ant-[A-Za-z0-9_\-]{20,200}/'],
        ['openrouter_key', '/\bsk-or-[A-Za-z0-9_\-]{20,200}/'],
        ['openai_key', '/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\-]{32,200}/'],
        ['stripe_key', '/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,200}\b/'],
        ['stripe_webhook', '/\bwhsec_[A-Za-z0-9_]{24,200}/'],
        ['slack_token', '/\bxox[abprs]-[A-Za-z0-9\-]{10,200}/'],
        ['slack_webhook', '/hooks\.slack\.com\/services\/[A-Z0-9]{8,}\/[A-Z0-9]{8,}\/[A-Za-z0-9]{16,}/'],
        ['google_api_key', '/\bAIza[0-9A-Za-z_\-]{35}/'],
        ['google_oauth', '/\bya29\.[A-Za-z0-9_\-]{20,300}/'],
        ['sendgrid_key', '/\bSG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}/'],
        ['npm_token', '/\bnpm_[A-Za-z0-9]{36}\b/'],
        ['vibyra_key', '/\bvyk_[A-Za-z0-9]{40}\b/'],
        ['jwt', '/\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/'],
    ];

    /** `Bearer <token>` and `Basic <base64>`: replaced only when the token looks random (see SecretGuard::random). */
    public const BEARER = '/\b([Bb]earer)([ \t]+)([A-Za-z0-9._~+\/\-]{20,})(=*)/';
    public const BASIC = '/\b([Bb]asic)([ \t]+)([A-Za-z0-9+\/]{16,})(={0,2})/';

    /** `scheme://user:password@host`: only the password is replaced. */
    public const URL_PASSWORD = '/\b([A-Za-z][A-Za-z0-9+.\-]{1,20}:\/\/[^ \t\r\n\x0b\x0c:\/@]{1,80}:)([^ \t\r\n\x0b\x0c@\/]{3,100})(@)/';

    /** `name = value`, `name: value`, `"name": "value"`, `NAME=value`: the value is replaced when the name reads as a secret. */
    public const PAIR = '/([A-Za-z_][A-Za-z0-9_.\-]{1,63})(["\']?[ \t]*[:=][ \t]*["\']?)([^ \t\r\n\x0b\x0c"\'`,;<>{}()\[\]\\\\&?]{6,400})/';

    /** Last word of a name that is a secret by itself. */
    public const STRONG = ['secret', 'token', 'password', 'passwd', 'pwd', 'passphrase', 'credential', 'credentials', 'apikey',
        'authtoken', 'secretkey', 'privatekey', 'accesskey', 'signingkey'];
    /** Last word that is a secret only next to one of PREFIX, or when the value itself looks random. */
    public const WEAK = ['key', 'auth'];
    public const PREFIX = ['api', 'secret', 'private', 'access', 'signing', 'client', 'auth', 'encryption', 'master', 'license', 'session'];

    /** A value that holds a stand-in, not a secret. */
    public const PLACEHOLDER_PARTS = ['example', 'your', 'changeme', 'change_me', 'placeholder', 'redacted', 'xxxx', 'dummy', 'sample',
        'replace', 'insert', 'todo', 'process.env', 'os.environ', 'getenv', 'secrets.'];
    public const PLACEHOLDER_WORDS = ['none', 'null', 'nil', 'undefined', 'false', 'true', 'string', 'required', 'optional', 'default', 'secret', 'password'];
}
