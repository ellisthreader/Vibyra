<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Services\ChatConnectors\ReconnectRequired;

/**
 * One Linear GraphQL call with a typed outcome. Linear reports throttling and
 * most refusals as GraphQL errors (often HTTP 400), so the error code decides:
 * RATELIMITED is rate_limited, AUTHENTICATION_ERROR needs a new sign-in, a
 * scope/permission error is insufficient_scope/forbidden, and a server error on
 * a mutation stays outcome_unknown. A mutation Linear answered with an error is a
 * definite refusal: it was not applied.
 */
final class LinearApi
{
    public static function query(string $token, string $query, array $variables, bool $write): array
    {
        $response = ProviderHttp::send('Linear', 'linear', $write, fn () => ProviderHttp::bearer($token)
            ->post('https://api.linear.app/graphql', ['query' => $query, 'variables' => (object) $variables]), [400]);
        $body = ProviderHttp::json($response, 'Linear', $write);
        $errors = is_array($body['errors'] ?? null) ? $body['errors'] : [];
        if ($errors === [] && is_array($body['data'] ?? null)) return $body['data'];
        $codes = array_map(fn ($e) => strtoupper((string) ($e['extensions']['code'] ?? '')), $errors);
        $text = strtolower(json_encode($errors));
        if (in_array('AUTHENTICATION_ERROR', $codes, true)) throw ReconnectRequired::for('linear');
        if (in_array('RATELIMITED', $codes, true)) throw ToolFailure::rateLimited('Linear', null);
        if (str_contains($text, 'scope')) throw ToolFailure::refused('insufficient_scope', 'Linear did not grant this permission. '
            .'Reconnect Linear from Agent connections to allow it.');
        if (in_array('FORBIDDEN', $codes, true)) throw ToolFailure::refused('forbidden', 'Linear refused this for this account.');
        if (str_contains($text, 'not found') || str_contains($text, 'entity_not_found'))
            throw ToolFailure::refused('not_found', 'Linear could not find that team or issue, or this account cannot see it.');
        if (in_array('INTERNAL_SERVER_ERROR', $codes, true) || $errors === [])
            throw $write ? ToolFailure::unknown('Linear') : ToolFailure::retryable('Linear had a temporary problem. Try again shortly.');
        throw ToolFailure::refused('invalid_request', 'Linear refused this request as invalid.');
    }

    public static function uuid(mixed $id, string $message): string
    {
        abort_unless(is_string($id) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di', $id), 422, $message);
        return strtolower($id);
    }

    public static function cursor(array $a): ?string
    {
        $c = $a['cursor'] ?? null;
        abort_unless($c === null || (is_string($c) && preg_match('/^[A-Za-z0-9_=\-]{1,200}$/D', $c)), 422, 'Use nextCursor from the previous result.');
        return $c;
    }

    public static function next(array $connection): array
    {
        $more = (bool) ($connection['pageInfo']['hasNextPage'] ?? false);
        return ['hasMore' => $more, 'nextCursor' => $more ? ($connection['pageInfo']['endCursor'] ?? null) : null,
            'coverage' => $more ? 'Partial: follow nextCursor for more.' : 'Complete.'];
    }
}
