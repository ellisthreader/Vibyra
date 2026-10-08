<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * One provider HTTP call, classified into a typed outcome. Reads that time out or
 * hit 5xx are retryable; a write that may have been sent (timeout, 5xx, or an
 * unconfirmable 2xx) is `outcome_unknown`. 401 and `invalid_grant` need a new
 * sign-in; 429 (and rate-limit 403s) are throttling; other 4xx are definite.
 */
final class ProviderHttp
{
    public static function google(string $token): PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->withOptions(['allow_redirects' => false]);
    }

    /** Any bearer-token provider, with redirects off so a token never follows a hop. */
    public static function bearer(string $token): PendingRequest
    {
        return self::google($token)->withOptions(['allow_redirects' => false]);
    }

    public static function github(string $token): PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->withOptions(['allow_redirects' => false])
            ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28']);
    }

    /**
     * @param callable(): Response $send
     * @param int[] $pass statuses the caller interprets itself (e.g. 409 on an idempotent insert)
     */
    public static function send(string $provider, string $slug, bool $write, callable $send, array $pass = []): Response
    {
        try { $response = $send(); }
        catch (ConnectionException) {
            throw $write ? ToolFailure::unknown($provider) : ToolFailure::retryable($provider.' did not respond in time. Try again shortly.');
        }
        $status = $response->status();
        if ($response->successful() || in_array($status, $pass, true)) return $response;
        $body = $response->json();
        $text = strtolower(is_array($body) ? json_encode($body) : (string) $response->body());
        if ($status === 401 || str_contains($text, 'invalid_grant')) throw ReconnectRequired::for($slug);
        if ($status === 429 || ($status === 403 && self::rateLimited($response, $text)))
            throw ToolFailure::rateLimited($provider, self::retryAfter($response));
        if ($status === 403 && (str_contains($text, 'insufficient') || str_contains($text, 'scope')))
            throw ToolFailure::refused('insufficient_scope', $provider.' did not grant this permission. Reconnect the account '
                .'with the wider access to use this tool.');
        if ($status >= 500)
            throw $write ? ToolFailure::unknown($provider) : ToolFailure::retryable($provider.' had a temporary problem. Try again shortly.');
        throw match ($status) {
            403 => ToolFailure::refused('forbidden', $provider.' refused access to this resource for this account.'),
            404, 410 => ToolFailure::refused('not_found', $provider.' could not find this resource, or this account cannot see it.'),
            409 => ToolFailure::refused('conflict', $provider.' refused this change because it conflicts with existing data.'),
            default => ToolFailure::refused('invalid_request', $provider.' refused this request as invalid.'),
        };
    }

    /** The decoded JSON object, or a typed failure when the provider answered with something else. */
    public static function json(Response $response, string $provider, bool $write): array
    {
        $body = $response->json();
        if (is_array($body)) return $body;
        throw $write ? ToolFailure::unknown($provider) : ToolFailure::retryable($provider.' returned an unreadable answer.');
    }

    private static function rateLimited(Response $response, string $text): bool
    {
        return $response->header('X-RateLimit-Remaining') === '0' || str_contains($text, 'ratelimitexceeded')
            || str_contains($text, 'rate limit') || str_contains($text, 'resource_exhausted') || str_contains($text, 'quotaexceeded');
    }

    private static function retryAfter(Response $response): ?int
    {
        $after = $response->header('Retry-After');
        if (is_numeric($after)) return max(1, min(3600, (int) $after));
        $reset = $response->header('X-RateLimit-Reset');
        return is_numeric($reset) ? max(1, min(3600, (int) $reset - time())) : null;
    }
}
