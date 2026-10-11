<?php
namespace App\Services\AgentOrganizations;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\DB;
final class Audit
{
    public static function record(string $org, int $actor, string $event, ?string $definition = null, ?int $revision = null): void
    {
        DB::table('agent_organisation_audit')->insert(['organization_id' => $org, 'actor_id' => $actor,
            'event' => $event, 'definition_id' => $definition, 'revision' => $revision, 'created_at' => now()]);
    }
    public static function page(int $user, ?int $cursor): array
    {
        $seat = Gate::member($user, false, 'manager');
        $q = DB::table('agent_organisation_audit')->where('organization_id', $seat->organization_id);
        if ($cursor !== null) {
            if (!(clone $q)->where('id', $cursor)->exists()) ApiError::throw(422, 'invalid_cursor', 'Reload organisation activity.');
            $q->where('id', '<', $cursor);
        }
        $rows = $q->orderByDesc('id')->limit(51)->get(); $page = $rows->take(50);
        return ['events' => $page->map(fn ($r) => ['id' => (string) $r->id, 'actorId' => (int) $r->actor_id,
            'event' => $r->event, 'definitionId' => $r->definition_id, 'revision' => $r->revision,
            'createdAt' => \Illuminate\Support\Carbon::parse($r->created_at)->toIso8601String()])->values()->all(),
            'nextCursor' => $rows->count() > 50 ? (string) $page->last()->id : null];
    }
}
