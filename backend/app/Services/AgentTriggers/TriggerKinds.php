<?php

namespace App\Services\AgentTriggers;

use Illuminate\Validation\ValidationException;

/**
 * The trigger kinds, their saved filters and how a raw provider payload becomes a small
 * summary. The filter is saved by the person, never chosen by the model. Summaries keep
 * only named fields, bounded, so a payload cannot smuggle extra structure into a run.
 */
final class TriggerKinds
{
    /** kind => [source, connection provider or null] */
    public const KINDS = [
        'github.issue' => ['webhook', null],
        'github.pull_request' => ['webhook', null],
        'stripe.event' => ['webhook', null],
        // Roadmap Part 11: the person's own code calls it with the trigger's secret (or an API key with triggers:invoke).
        'api.invoke' => ['webhook', null],
        // Linear: per-trigger webhook (Linear issues the signing secret; paste it). The account is optional (loop guard, assignee "me").
        'linear.issue' => ['webhook', 'linear'],
        // Slack: one app-level Events API endpoint (hooks/slack); routed to the account's workspace, so the account is required.
        'slack.mention' => ['webhook', 'slack'],
        'gmail.message' => ['poll', 'gmail'],
        'calendar.event_soon' => ['poll', 'google_calendar'],
    ];

    /** Kinds whose connected account is optional. */
    public const OPTIONAL_CONNECTION = ['linear.issue'];

    public static function provider(string $kind): ?string
    {
        return self::KINDS[$kind][1] ?? null;
    }

    public static function normalize(string $kind, mixed $filter): array
    {
        $f = is_array($filter) ? $filter : [];
        return match ($kind) {
            'github.issue', 'github.pull_request' => array_filter([
                'repository' => self::optional($f, 'repository', '/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/D', 'Use owner/repo.'),
                'actions' => self::list($f, 'actions', '/^[a-z_]{2,40}$/D') ?: ['opened'],
                'labels' => self::list($f, 'labels', '/^.{1,50}$/uD') ?: null,
                'includeOwn' => ($f['includeOwn'] ?? false) === true ? true : null]),
            'linear.issue' => LinearEvents::filter($f),
            'slack.mention' => SlackMentions::filter($f),
            'api.invoke' => ApiInvoke::filter($f),
            'stripe.event' => ['types' => self::list($f, 'types', '/^[a-z_.*]{3,80}$/D')
                ?: self::fail('filter.types', 'Choose at least one Stripe event type, e.g. charge.dispute.created.')],
            'gmail.message' => array_filter(['query' => self::optional($f, 'query', '/^[^\r\n]{1,150}$/uD', 'Give a Gmail search.'),
                'pollMinutes' => self::int($f, 'pollMinutes', 1, 60, 5)], fn ($v) => $v !== null),
            'calendar.event_soon' => ['calendarId' => self::optional($f, 'calendarId', '/^(primary|[A-Za-z0-9._%+#\-]+@[A-Za-z0-9.\-]+)$/D',
                'Use "primary" or an exact calendar id.') ?? 'primary', 'leadMinutes' => self::int($f, 'leadMinutes', 5, 240, 15)],
            default => self::fail('kind', 'Unknown trigger kind.'),
        };
    }

    /** GitHub webhook body → [event key type, summary, subject, actor ids] when it matches the saved filter, else null. */
    public static function github(string $kind, string $event, array $body, array $filter): ?array
    {
        $want = $kind === 'github.issue' ? 'issues' : 'pull_request';
        if ($event !== $want) return null;
        $item = $body[$want === 'issues' ? 'issue' : 'pull_request'] ?? null;
        $repo = $body['repository']['full_name'] ?? null;
        if (!is_array($item) || !is_string($repo)) return null;
        $action = (string) ($body['action'] ?? '');
        if (!in_array($action, $filter['actions'] ?? ['opened'], true)) return null;
        if (isset($filter['repository']) && strcasecmp($filter['repository'], $repo) !== 0) return null;
        $labels = array_values(array_filter(array_map(fn ($l) => is_array($l) ? ($l['name'] ?? null) : null, $item['labels'] ?? []), 'is_string'));
        if (!empty($filter['labels']) && !array_intersect($filter['labels'], $labels)) return null;
        return [$want.'.'.$action, ['repository' => $repo, 'action' => $action, 'number' => (int) ($item['number'] ?? 0),
            'title' => self::text($item['title'] ?? '', 300), 'body' => self::text($item['body'] ?? '', 4000),
            'author' => self::text($item['user']['login'] ?? '', 100), 'labels' => array_slice($labels, 0, 20),
            'url' => self::text($item['html_url'] ?? '', 500)], 'github:'.strtolower($repo).'#'.(int) ($item['number'] ?? 0),
            array_values(array_filter([strtolower(self::text($body['sender']['login'] ?? ($item['user']['login'] ?? ''), 100))]))];
    }

    /** Stripe event → [type, summary] when its type is in the saved list (`prefix.*` allowed). */
    public static function stripe(array $event, array $filter): ?array
    {
        $type = (string) ($event['type'] ?? '');
        $match = false;
        foreach ($filter['types'] ?? [] as $t) $match = $match || $t === $type || (str_ends_with($t, '.*') && str_starts_with($type, substr($t, 0, -1)));
        if (!$match) return null;
        $o = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
        $object = array_map(fn ($v) => is_scalar($v) ? self::text((string) $v, 300) : null, array_intersect_key($o,
            array_flip(['id', 'object', 'amount', 'amount_received', 'currency', 'status', 'customer', 'description', 'reason', 'receipt_email'])));
        return [$type, ['id' => self::text($event['id'] ?? '', 100), 'type' => $type, 'livemode' => (bool) ($event['livemode'] ?? false),
            'created' => is_int($event['created'] ?? null) ? gmdate('c', $event['created']) : null, 'object' => array_filter($object, fn ($v) => $v !== null)]];
    }

    public static function text(mixed $value, int $max): string
    {
        return mb_substr(is_scalar($value) ? (string) $value : '', 0, $max);
    }

    public static function optional(array $f, string $key, string $pattern, string $message): ?string
    {
        $v = $f[$key] ?? null;
        if ($v === null || $v === '') return null;
        if (!is_string($v) || !preg_match($pattern, $v)) self::fail('filter.'.$key, $message);
        return $v;
    }

    public static function list(array $f, string $key, string $pattern): array
    {
        $v = $f[$key] ?? [];
        if (!is_array($v) || !array_is_list($v) || count($v) > 20) self::fail('filter.'.$key, 'Give a list of up to 20 values.');
        foreach ($v as $item) if (!is_string($item) || !preg_match($pattern, $item)) self::fail('filter.'.$key, 'One of these values is not valid.');
        return array_values(array_unique($v));
    }

    public static function int(array $f, string $key, int $min, int $max, int $default): int
    {
        $v = $f[$key] ?? $default;
        if (!is_int($v) || $v < $min || $v > $max) self::fail('filter.'.$key, "Choose $min to $max.");
        return $v;
    }

    public static function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
