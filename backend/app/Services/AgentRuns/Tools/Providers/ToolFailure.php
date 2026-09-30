<?php

namespace App\Services\AgentRuns\Tools\Providers;

use RuntimeException;

/**
 * A typed provider outcome that is not a confirmed result. The broker records it
 * on the action and passes `outcome`/`reason`/`message` to the model:
 *
 * - `refused`       definite refusal (not found, forbidden, invalid, insufficient scope); do not retry as-is
 * - `retryable`     a read that failed transiently (timeout, 5xx); the model may call again later
 * - `rate_limited`  provider throttling (429 / rate-limit 403); `retryAfter` seconds when known
 * - `outcome_unknown` a write that may have reached the provider; never retried automatically
 *
 * Reconnect-required is `ChatConnectors\ReconnectRequired`, shared with ordinary chat.
 */
final class ToolFailure extends RuntimeException
{
    public const REFUSED = 'refused';
    public const RETRYABLE = 'retryable';
    public const RATE_LIMITED = 'rate_limited';
    public const UNKNOWN = 'outcome_unknown';

    public function __construct(public readonly string $outcome, public readonly string $reason, string $message,
        public readonly ?int $retryAfter = null)
    {
        parent::__construct($message);
    }

    public static function refused(string $reason, string $message): self
    {
        return new self(self::REFUSED, $reason, $message);
    }

    public static function retryable(string $message): self
    {
        return new self(self::RETRYABLE, 'provider_unavailable', $message);
    }

    public static function rateLimited(string $provider, ?int $retryAfter): self
    {
        return new self(self::RATE_LIMITED, 'rate_limited', $provider.' is rate limiting this account. Try again'
            .($retryAfter ? ' in '.$retryAfter.' seconds.' : ' later.'), $retryAfter);
    }

    public static function unknown(string $provider): self
    {
        return new self(self::UNKNOWN, 'outcome_unknown', $provider.' did not confirm this change. It may or may not '
            .'have happened. Do not repeat it; ask the person to check '.$provider.' first.');
    }
}
