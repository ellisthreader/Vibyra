<?php

namespace App\Services\AgentTriggers;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Trigger;
use App\Models\AgentV2\TriggerEvent;
use App\Services\AgentRuns\Access;
use App\Services\AgentRuns\Connections\Connections;
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Grants;
use App\Services\AgentRuns\Tools\Providers\CalendarTools;
use App\Services\AgentRuns\Tools\Providers\GmailTools;
use App\Services\AgentRuns\Tools\Providers\ToolFailure;
use App\Services\ChatConnectors\ReconnectRequired;
use Carbon\CarbonImmutable;
use App\Services\AgentWork\{FollowUpAuthority, FollowUpObservations};

/**
 * Poll triggers, run by the scheduler every minute. Gmail: each trigger polls every
 * `pollMinutes` with its saved query plus `after:<cursor>`; the cursor overlaps the last
 * poll by 5 minutes and message IDs dedupe. The first poll only sets the cursor (no
 * back-fill). Calendar: events starting within `leadMinutes`, deduped by event + start.
 * Both read through the same server-side tools and credentials as the broker, and only
 * while the teammate still holds a read grant on that connection.
 * (Gmail Pub/Sub `users.watch` push is deferred; polling is the whole path for now.)
 */
final class Pollers
{
    private const OVERLAP_SECONDS = 300;

    public function __construct(private readonly TriggerIntake $intake, private readonly Access $access,
        private readonly Credentials $credentials, private readonly Connections $connections, private readonly Grants $grants) {}

    /** @return int triggers polled */
    public function tick(): int
    {
        $now = CarbonImmutable::now();
        TriggerEvent::query()->where('state', 'pending')->where('created_at', '<=', $now->subMinute())->limit(100)->get()
            ->each(function (TriggerEvent $e) {
                if ($t = Trigger::query()->whereKey($e->trigger_id)->first()) $this->intake->admit($t, $e);
            });
        $polled = 0;
        Trigger::query()->whereIn('kind', ['gmail.message', 'calendar.event_soon'])->whereNull('paused_at')->whereNull('deleted_at')
            ->orderBy('polled_at')->limit(200)->get()->each(function (Trigger $t) use ($now, &$polled) {
                $every = $t->kind === 'gmail.message' ? (int) ($t->filter['pollMinutes'] ?? 5) : 1;
                if ($t->polled_at && $t->polled_at->greaterThan($now->subMinutes($every)->addSeconds(5))) return;
                $polled++;
                $this->poll($t, $now);
            });
        return $polled;
    }

    public function poll(Trigger $t, CarbonImmutable $now): void
    {
        $error = null; $complete = false;
        $authority = config('agents_v2.work_enabled') ? FollowUpAuthority::snapshot($t) : null;
        $windowStart = $t->kind === 'gmail.message' ? ($t->cursor['after'] ?? null) : null;
        try {
            $connection = $this->readable($t);
            if (is_string($connection)) $error = $connection;
            elseif ($t->kind === 'gmail.message') $complete = $this->gmail($t, $connection, $now, $authority);
            else $complete = $this->calendar($t, $connection, $now, $authority);
        } catch (ReconnectRequired) {
            $error = 'reconnect_required';
            if ($row = Connection::query()->whereKey($t->connection_id)->first()) $this->connections->markReconnect($row);
        } catch (ToolFailure $e) {
            $error = mb_substr($e->reason ?: $e->outcome, 0, 60);
        }
        FollowUpObservations::record($t, $authority, $complete && !$error, $now, is_int($windowStart) ? $windowStart : null);
        $t->forceFill(['polled_at' => $now, 'last_error' => $error])->save();
    }

    private function gmail(Trigger $t, Connection $c, CarbonImmutable $now, ?array $authority): bool
    {
        $after = $t->cursor['after'] ?? null;
        $next = ['after' => $now->getTimestamp() - self::OVERLAP_SECONDS];
        if (!is_int($after)) { $t->cursor = $next; return false; }
        $saved = $t->filter['query'] ?? null;
        $query = ($saved ? '('.$saved.') ' : '').'after:'.$after;
        $found = app(GmailTools::class)->run('gmail_search', ['query' => $query, 'maxResults' => 20], $this->credentials->for($c), '');
        foreach (array_reverse($found['result']['messages'] ?? []) as $m) {
            if (!is_string($m['id'] ?? null)) continue;
            $this->intake->receive($t, 'gmail:'.$m['id'], 'gmail.message', ['account' => $c->external_identity,
                'messageId' => $m['id'], 'threadId' => $m['threadId'] ?? null, 'from' => TriggerKinds::text($m['from'] ?? '', 300),
                'subject' => TriggerKinds::text($m['subject'] ?? '', 300), 'date' => TriggerKinds::text($m['date'] ?? '', 100),
                'snippet' => TriggerKinds::text($m['snippet'] ?? '', 300)], null, null, $authority);
        }
        // Advance only after a successful read, so a failed poll re-reads the same window.
        $complete = ($found['result']['metadataComplete'] ?? false) === true && empty($found['result']['hasMore']) && empty($found['result']['nextPageToken']);
        if ($complete) $t->cursor = $next;
        return $complete;
    }

    private function calendar(Trigger $t, Connection $c, CarbonImmutable $now, ?array $authority): bool
    {
        $tools = app(CalendarTools::class);
        $args = $tools->validate('google_calendar_list_events', ['calendarId' => $t->filter['calendarId'] ?? 'primary',
            'timeMin' => $now->toIso8601String(), 'timeMax' => $now->addMinutes((int) ($t->filter['leadMinutes'] ?? 15))->toIso8601String(),
            'timeZone' => 'UTC', 'maxResults' => 20]);
        $found = $tools->run('google_calendar_list_events', $args, $this->credentials->for($c), '');
        foreach ($found['result']['events'] ?? [] as $e) {
            if (!is_string($e['id'] ?? null) || ($e['allDay'] ?? false) || ($e['status'] ?? '') === 'cancelled') continue;
            if (!is_string($e['start'] ?? null) || CarbonImmutable::parse($e['start'])->lessThan($now)) continue;
            $this->intake->receive($t, 'calendar:'.$e['id'].':'.$e['start'], 'calendar.event_soon', ['account' => $c->external_identity,
                'calendarId' => $args['calendarId'], 'eventId' => $e['id'], 'title' => TriggerKinds::text($e['title'] ?? '', 250),
                'start' => $e['start'], 'end' => $e['end'] ?? null, 'url' => TriggerKinds::text($e['url'] ?? '', 500)], null, null, $authority);
        }
        return empty($found['result']['hasMore']) && empty($found['result']['nextPageToken']);
    }

    /** The connection to read, or why this poll is skipped. */
    private function readable(Trigger $t): Connection|string
    {
        if (!$this->access->allows($t->user_id)) return 'agents_v2_unavailable';
        $c = Connection::query()->whereKey($t->connection_id)->where('user_id', $t->user_id)->whereNull('revoked_at')->first();
        if (!$c) return 'connection_revoked';
        if ($c->health !== 'healthy') return 'reconnect_required';
        $read = $t->kind === 'gmail.message' ? 'gmail_search' : 'google_calendar_list_events';
        $granted = collect($this->grants->active($t->user_id, $t->agent_id))
            ->first(fn ($g) => $g->connection_id === $c->id && in_array($read, $g->operations ?? [], true));
        return $granted ? $c : 'grant_revoked';
    }
}
