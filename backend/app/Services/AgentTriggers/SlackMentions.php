<?php

namespace App\Services\AgentTriggers;

/**
 * Slack Events API `app_mention` → saved filter → bounded summary. Filter: `channel` (one channel id, optional).
 * A mention the app itself wrote (a bot id, the app's bot user, a bot_message) is flagged so it never starts a run.
 */
final class SlackMentions
{
    /** The bot scope Slack needs to deliver `app_mention` events; connections made before it was asked for must reconnect. */
    public const SCOPE = 'app_mentions:read';

    public static function scopeReady(\App\Models\AgentV2\Connection $c): bool
    {
        return in_array(self::SCOPE, $c->scopes ?? [], true);
    }

    public static function filter(array $f): array
    {
        return array_filter(['channel' => TriggerKinds::optional($f, 'channel', '/^[CGD][A-Z0-9]{8,20}$/D', 'Use a Slack channel ID like C0123456789.')],
            fn ($v) => $v !== null);
    }

    /** @return ?array [type, summary, subject, actor ids, authored by the app] */
    public static function match(array $envelope, array $filter): ?array
    {
        $e = $envelope['event'] ?? null;
        $team = (string) ($envelope['team_id'] ?? '');
        if (!is_array($e) || ($e['type'] ?? '') !== 'app_mention' || !is_string($e['channel'] ?? null) || !is_string($e['ts'] ?? null) || $team === '') return null;
        if (isset($filter['channel']) && $filter['channel'] !== $e['channel']) return null;
        $bots = [];
        foreach ((array) ($envelope['authorizations'] ?? []) as $a) if (is_array($a) && ($a['is_bot'] ?? false) && is_string($a['user_id'] ?? null)) $bots[] = $a['user_id'];
        $user = is_string($e['user'] ?? null) ? $e['user'] : '';
        $thread = is_string($e['thread_ts'] ?? null) ? $e['thread_ts'] : $e['ts'];
        $own = isset($e['bot_id']) || ($e['subtype'] ?? '') === 'bot_message' || ($user !== '' && in_array($user, $bots, true));
        return ['app_mention', ['team' => TriggerKinds::text($team, 20), 'channel' => $e['channel'], 'user' => TriggerKinds::text($user, 20),
            'text' => TriggerKinds::text($e['text'] ?? '', 4000), 'ts' => TriggerKinds::text($e['ts'], 30),
            'threadTs' => TriggerKinds::text($thread, 30)], 'slack:'.$team.':'.$e['channel'].':'.$thread, $user === '' ? [] : [strtolower($user)], $own];
    }
}
