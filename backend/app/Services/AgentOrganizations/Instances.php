<?php
namespace App\Services\AgentOrganizations;
use App\Services\AgentRuns\{ApiError, Jobs\AccountLock, RunStates};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class Instances
{
    public static function get(string $agent): ?object
    {
        return DB::table('agent_organisation_instances')->where('agent_id', $agent)->first();
    }
    public static function adopt(int $user, string $id, int $revision, string $hash): array
    {
        return DB::transaction(function () use ($user, $id, $revision, $hash) {
            AccountLock::force($user);
            $seat = Gate::member($user, true); $d = Definitions::find($seat->organization_id, $id);
            $v = Definitions::version($d->id, $d->revision); $p = Policies::get($seat->organization_id);
            if (!$p->enabled || $d->retired_at) ApiError::throw(409, 'organisation_agent_unavailable', 'This organisation Agent is disabled or retired.');
            if ((int) $d->revision !== $revision || !hash_equals($v->review_hash, $hash))
                ApiError::throw(409, 'organisation_agent_changed', 'Review the current published version before using it.');
            $i = DB::table('agent_organisation_instances')->where('definition_id', $id)->where('member_id', $seat->id)->first();
            if ($i && (int) $i->revision === $revision) return self::receipt($i);
            if ($i) {
                if (DB::table('agent_runs')->where('agent_id', $i->agent_id)->whereNotIn('state', RunStates::TERMINAL)->exists())
                    ApiError::throw(409, 'organisation_agent_busy', 'Finish or cancel current tasks before adopting an updated Agent.');
                DB::table('agent_organisation_instances')->where('agent_id', $i->agent_id)->update(['revision' => $revision, 'updated_at' => now()]);
                DB::table('agent_teammates')->where('id', $i->agent_id)->update(['name' => $v->name, 'avatar' => $v->avatar,
                    'brief' => $v->instructions, 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
                DB::table('vibes_chats')->where('agent_id', $i->agent_id)->update(['title' => $v->name, 'revision' => DB::raw('revision + 1')]);
            } else {
                // Organisation use is an explicit create, never a copy of a private teammate or its account grants.
                if (DB::table('agent_teammates')->where('user_id', $user)->count() >= (int) config('agents.max_teammates'))
                    ApiError::throw(422, 'agent_limit', 'Archive or remove a teammate before adding another.');
                $agent = (string) Str::uuid(); $chat = (string) Str::uuid();
                DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user, 'title' => $v->name,
                    'agent_id' => $agent, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('agent_teammates')->insert(['id' => $agent, 'user_id' => $user, 'chat_id' => $chat,
                    'name' => $v->name, 'avatar' => $v->avatar, 'brief' => $v->instructions, 'memory' => '',
                    'budget' => 100, 'integrations' => '[]', 'create_hash' => hash('sha256', $id.':'.$seat->id),
                    'created_at' => now(), 'updated_at' => now()]);
                DB::table('agent_organisation_instances')->insert(['agent_id' => $agent, 'organization_id' => $seat->organization_id,
                    'definition_id' => $id, 'user_id' => $user, 'member_id' => $seat->id, 'revision' => $revision,
                    'created_at' => now(), 'updated_at' => now()]);
                $i = self::get($agent);
            }
            Audit::record($seat->organization_id, $user, 'definition.adopted', $id, $revision);
            return self::receipt(self::get($i->agent_id));
        });
    }
    private static function receipt(object $i): array
    {
        return ['agentId' => $i->agent_id, 'definitionId' => $i->definition_id, 'revision' => (int) $i->revision];
    }
    public static function metadata(string $agent): ?array
    {
        $i = self::get($agent); if (!$i) return null;
        return ['organizationId' => $i->organization_id, 'teamName' => DB::table('organizations')->where('id', $i->organization_id)->value('name'),
            'definitionId' => $i->definition_id, 'revision' => (int) $i->revision,
            'reviewHash' => Definitions::version($i->definition_id, $i->revision)->review_hash, 'managedProfile' => true];
    }
    public static function personalOnly(string $agent): void
    {
        if (self::get($agent)) ApiError::throw(409, 'organisation_scope_unsupported',
            'Use a personal Agent for this feature. Organisation Agents require their private, governed task engine.');
    }
    public static function guardEdit(string $id, array $fields): void
    {
        $i = self::get($id); if (!$i) return;
        $v = Definitions::version($i->definition_id, $i->revision);
        if ($fields['name'] !== $v->name || $fields['brief'] !== $v->instructions || $fields['avatar'] !== $v->avatar)
            ApiError::throw(409, 'organisation_managed_profile', 'Publish organisation profile changes from Organisation Agents. Private memory and Access remain yours.');
    }
    public static function groupScope(array $ids): void
    {
        $instances = DB::table('agent_organisation_instances')->whereIn('agent_id', $ids)->get();
        if ($instances->isEmpty()) return;
        if ($instances->count() !== count($ids) || $instances->pluck('organization_id')->unique()->count() !== 1)
            ApiError::throw(409, 'organisation_scope_unsupported', 'Keep organisation Agents in a group with Agents from the same organisation. Personal Agents belong in a separate group.');
    }
}
