<?php

namespace App\Services\AgentTriggers;

use App\Jobs\ProcessSlackEvent;
use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Trigger;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\Cache;

/**
 * Slack Events API, one app-level endpoint. Slack signs with the app's single signing secret (`v0=` HMAC over
 * `v0:<timestamp>:<raw body>`, timestamp within five minutes), wants `url_verification` answered, and retries unless
 * it hears 2xx within three seconds. So the request path only verifies, de-duplicates by `event_id` and enqueues;
 * `route` (run by ProcessSlackEvent) finds the workspace's connections and active triggers and admits there.
 * A retry carries the same event_id: it is acknowledged without a second enqueue, and the per-trigger event row
 * (`slack:<event_id>`) makes even a repeated job harmless.
 */
final class SlackEvents
{
    public function __construct(private readonly Webhooks $webhooks) {}

    public function verify(string $raw, string $timestamp, string $signature): void
    {
        $secret = (string) config('agents_v2.slack_signing_secret', '');
        if ($secret === '') ApiError::throw(404, 'slack_not_configured', 'Slack events are not set up in this environment.');
        $window = (int) config('agents_v2.slack_tolerance_seconds', 300);
        if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > $window)
            ApiError::throw(401, 'stale_timestamp', 'The request timestamp is outside the allowed window.');
        if (!hash_equals('v0='.hash_hmac('sha256', 'v0:'.$timestamp.':'.$raw, $secret), $signature))
            ApiError::throw(401, 'invalid_signature', 'The request signature did not match.');
    }

    /** @return array{challenge?: string, ok?: bool, state?: string} what to answer; never admits inline */
    public function accept(string $raw): array
    {
        $body = json_decode($raw, true);
        if (!is_array($body)) ApiError::throw(422, 'invalid_payload', 'The request body is not JSON.');
        if (($body['type'] ?? '') === 'url_verification' && is_string($body['challenge'] ?? null)) return ['challenge' => $body['challenge']];
        $id = $body['event_id'] ?? null;
        if (($body['type'] ?? '') !== 'event_callback' || !is_string($id) || !preg_match('/^[A-Za-z0-9]{6,40}$/D', $id)
            || ($body['event']['type'] ?? '') !== 'app_mention') return ['ok' => true, 'state' => 'ignored'];
        if (!Cache::add('slack-event:'.$id, 1, 3600)) return ['ok' => true, 'state' => 'duplicate'];
        try {
            ProcessSlackEvent::dispatch(['team_id' => $body['team_id'] ?? null, 'event_id' => $id, 'event' => $body['event'],
                'authorizations' => array_slice(array_map(fn ($a) => is_array($a) ? array_intersect_key($a, ['user_id' => 1, 'is_bot' => 1]) : [],
                    (array) ($body['authorizations'] ?? [])), 0, 5)]);
        } catch (\Throwable $e) {
            Cache::forget('slack-event:'.$id); // not queued: let Slack's retry bring it back
            throw $e;
        }
        return ['ok' => true, 'state' => 'queued'];
    }

    /** Admit for every active mention trigger on the event's workspace. @return int triggers that received it */
    public function route(array $envelope): int
    {
        $team = (string) ($envelope['team_id'] ?? '');
        $id = (string) ($envelope['event_id'] ?? '');
        if ($team === '' || $id === '') return 0;
        $connections = Connection::query()->where('provider', 'slack')->whereNull('revoked_at')
            ->where('external_identity', 'like', '% · '.$team.'%')->get(['id', 'external_identity'])
            ->filter(fn ($c) => OwnActor::slackTeam($c->external_identity) === $team)->pluck('id')->all();
        if ($connections === []) return 0;
        $count = 0;
        foreach (Trigger::query()->where('kind', 'slack.mention')->whereNull('deleted_at')->whereIn('connection_id', $connections)->get() as $trigger) {
            $this->webhooks->slack($trigger, $id, SlackMentions::match($envelope, $trigger->filter ?? []));
            $count++;
        }
        return $count;
    }
}
