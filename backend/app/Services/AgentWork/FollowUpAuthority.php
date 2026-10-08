<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Connection, Grant, Trigger};
use App\Services\AgentRuns\Canonical;

/** Trigger → connection → read grant; all are locked before a work/runtime/run row. */
final class FollowUpAuthority
{
    public static function snapshot(Trigger $t, bool $lock = false): ?array
    {
        $base = ['triggerId' => $t->id, 'triggerRevision' => $t->revision, 'connectionId' => $t->connection_id];
        if (!$t->connection_id) return $base;
        $q = Connection::whereKey($t->connection_id)->where('user_id', $t->user_id)->whereNull('revoked_at');
        $c = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$c || $c->health !== 'healthy') return null;
        $base['generation'] = $c->generation;
        $read = match ($t->kind) { 'gmail.message' => 'gmail_search', 'calendar.event_soon' => 'google_calendar_list_events',
            'slack.mention' => 'slack_read_channel', 'linear.issue' => 'linear_read_issue', default => null };
        if (!$read) return $base;
        $q = Grant::where('user_id', $t->user_id)->where('agent_id', $t->agent_id)->where('connection_id', $c->id)->whereNull('revoked_at');
        $grants = ($lock ? $q->lockForUpdate() : $q)->get();
        $g = $grants->first(fn ($g) => in_array($read, $g->operations ?? [], true));
        return $g ? $base + ['grantId' => $g->id, 'grantRevision' => $g->revision, 'operation' => $read] : null;
    }

    public static function hash(?array $snapshot): ?string
    {
        return $snapshot === null ? null : Canonical::hash($snapshot);
    }
}
