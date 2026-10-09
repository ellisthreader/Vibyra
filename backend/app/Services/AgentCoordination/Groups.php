<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\Group;
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentRuns\Tools\Providers\Schema;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;
final class Groups
{
    public function find(int $userId, string $id, bool $lock = false): Group
    {
        $q = Group::where('user_id', $userId)->whereKey($id);
        $g = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$g) ApiError::throw(404, 'group_not_found', 'That group does not exist.');
        return $g;
    }
    public function save(int $userId, string $id, array $data): array
    {
        Gate::require($userId); abort_unless(Str::isUuid($id), 422, 'Use a valid group ID.');
        Schema::only($data, ['expectedRevision', 'name', 'coordinatorId', 'members']);
        $d = Validator::make($data, ['expectedRevision' => 'required|integer|min:0', 'name' => 'required|string|max:120',
            'coordinatorId' => 'required|uuid', 'members' => 'required|array|min:2|max:8',
            'members.*.agentId' => 'required|uuid|distinct', 'members.*.handle' => ['required', 'distinct', 'regex:/^[a-z][a-z0-9_-]{0,31}$/D']])->validate();
        $d['name'] = trim($d['name']); abort_if($d['name'] === '' || !array_is_list($d['members']), 422, 'Name the group and choose its teammates.');
        foreach ($d['members'] as $m) Schema::only($m, ['agentId', 'handle']);
        abort_unless(in_array($d['coordinatorId'], array_column($d['members'], 'agentId'), true), 422, 'Choose a coordinator in this group.');
        return DB::transaction(function () use ($userId, $id, $d) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            DB::table('users')->where('id', $userId)->lockForUpdate()->firstOrFail();
            $g = Group::where('user_id', $userId)->whereKey($id)->lockForUpdate()->first();
            if (!$g && Group::whereKey($id)->exists()) abort(404);
            if ($g?->deleted_at) ApiError::throw(409, 'group_deleted', 'Create a new group instead of restoring deleted authority.');
            $same = $g && $g->name === $d['name'] && $g->coordinator_id === $d['coordinatorId'] && Canonical::hash($g->members) === Canonical::hash($d['members']);
            if ($same && in_array($g->revision, [(int) $d['expectedRevision'], (int) $d['expectedRevision'] + 1], true)) return $this->payload($g);
            Gate::revision($g?->revision ?? 0, (int) $d['expectedRevision']); MemberPins::capture($userId, $d['members']);
            if (!$g) abort_if(Group::where('user_id', $userId)->whereNull('deleted_at')->count() >= 20, 422, 'Keep at most 20 groups.');
            $values = ['name' => $d['name'], 'coordinator_id' => $d['coordinatorId'], 'members' => $d['members'], 'revision' => ($g?->revision ?? 0) + 1];
            if ($g) $g->forceFill($values)->save(); else $g = Group::create(['id' => $id, 'user_id' => $userId, ...$values]);
            return $this->payload($g);
        });
    }
    public function delete(int $userId, string $id, int $revision): array
    {
        return DB::transaction(function () use ($userId, $id, $revision) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $g = $this->find($userId, $id, true);
            if ($g->deleted_at && $g->revision === $revision + 1) return $this->payload($g);
            Gate::revision($g->revision, $revision);
            if (!$g->deleted_at) $g->forceFill(['deleted_at' => now(), 'revision' => $g->revision + 1])->save();
            return $this->payload($g);
        });
    }
    public function list(int $userId, bool $includeArchived = false): array
    {
        return Group::where('user_id', $userId)->when(!$includeArchived, fn ($q) => $q->whereNull('deleted_at'))->orderByDesc('updated_at')->orderBy('id')->limit(50)->get()->map(fn ($g) => $this->payload($g))->all();
    }
    public function payload(Group $g): array
    {
        $rows = DB::table('agent_teammates')->where('user_id', $g->user_id)->whereIn('id', array_column($g->members, 'agentId'))->get()->keyBy('id');
        return ['id' => $g->id, 'name' => $g->name, 'revision' => $g->revision, 'coordinatorId' => $g->coordinator_id,
            'members' => array_map(fn ($m) => [...$m, 'name' => $rows->get($m['agentId'])?->name ?? 'Removed teammate',
                'profileRevision' => (int) ($rows->get($m['agentId'])?->revision ?? 0)], $g->members),
            'deletedAt' => $g->deleted_at?->toIso8601String(), 'createdAt' => $g->created_at?->toIso8601String(), 'updatedAt' => $g->updated_at?->toIso8601String()];
    }
}
