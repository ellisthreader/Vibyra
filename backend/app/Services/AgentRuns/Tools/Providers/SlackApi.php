<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Services\ChatConnectors\ReconnectRequired;

/**
 * One Slack Web API call with a typed outcome. Slack answers most failures with
 * HTTP 200 and `ok: false`, so the reason lives in the body: a dead token needs a
 * new sign-in, a missing scope (or a bot token asked to search) is
 * `insufficient_scope`, and an `ok: false` on a post is a definite refusal: Slack
 * says it did not post. Transport loss and 5xx on a post stay `outcome_unknown`.
 */
final class SlackApi
{
    private const BASE = 'https://slack.com/api/';
    private const RECONNECT = ['invalid_auth', 'token_revoked', 'token_expired', 'account_inactive', 'not_authed'];
    private const SCOPE = ['missing_scope', 'not_allowed_token_type', 'no_permission'];
    private const NOT_FOUND = ['channel_not_found', 'thread_not_found', 'message_not_found'];
    private const TRANSIENT = ['internal_error', 'fatal_error', 'service_unavailable', 'request_timeout'];

    public static function get(string $token, string $method, array $query, bool $write = false): array
    {
        $response = ProviderHttp::send('Slack', 'slack', $write, fn () => ProviderHttp::bearer($token)->get(self::BASE.$method, $query));
        return self::body(ProviderHttp::json($response, 'Slack', $write), $write);
    }

    public static function post(string $token, string $method, array $payload): array
    {
        $response = ProviderHttp::send('Slack', 'slack', true, fn () => ProviderHttp::bearer($token)->asJson()->post(self::BASE.$method, $payload));
        return self::body(ProviderHttp::json($response, 'Slack', true), true);
    }

    private static function body(array $body, bool $write): array
    {
        if (($body['ok'] ?? null) === true) return $body;
        $error = is_string($body['error'] ?? null) ? $body['error'] : 'unknown_error';
        if (in_array($error, self::RECONNECT, true)) throw ReconnectRequired::for('slack');
        if ($error === 'ratelimited') throw ToolFailure::rateLimited('Slack', null);
        if (in_array($error, self::SCOPE, true)) throw ToolFailure::refused('insufficient_scope', 'Slack did not grant this '
            .'permission. Searching messages needs the "Add another account" Slack sign-in (a user token with search:read); '
            .'reconnect Slack from Agent connections.');
        if (in_array($error, self::NOT_FOUND, true))
            throw ToolFailure::refused('not_found', 'Slack could not find that channel or message, or this account cannot see it.');
        if (in_array($error, self::TRANSIENT, true))
            throw $write ? ToolFailure::unknown('Slack') : ToolFailure::retryable('Slack had a temporary problem. Try again shortly.');
        if (in_array($error, ['not_in_channel', 'is_archived', 'restricted_action', 'channel_is_archived', 'access_denied'], true))
            throw ToolFailure::refused('forbidden', 'Slack refused this for this account ('.$error.'). Join the channel first or pick another.');
        throw ToolFailure::refused('invalid_request', 'Slack refused this request ('.mb_substr($error, 0, 60).').');
    }

    public static function channel(mixed $channel): string
    {
        abort_unless(is_string($channel) && preg_match('/^[CGD][A-Z0-9]{8,20}$/D', $channel), 422,
            'Use an exact Slack channel ID (for example C0123456789) from slack_list_channels.');
        return $channel;
    }

    public static function cursor(array $arguments): ?string
    {
        $cursor = $arguments['cursor'] ?? null;
        abort_unless($cursor === null || (is_string($cursor) && preg_match('/^[A-Za-z0-9=_\-]{1,300}$/D', $cursor)), 422,
            'That cursor is invalid. Use nextCursor from the previous result.');
        return $cursor;
    }

    public static function message(array $m): array
    {
        return ['user' => $m['user'] ?? ($m['username'] ?? null), 'text' => mb_substr((string) ($m['text'] ?? ''), 0, 2000),
            'ts' => $m['ts'] ?? null, 'threadTs' => $m['thread_ts'] ?? null, 'replies' => (int) ($m['reply_count'] ?? 0)];
    }
}
