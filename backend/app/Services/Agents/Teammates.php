<?php

namespace App\Services\Agents;

use App\Services\ChatConnectors\ConnectorTools;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Teammates
{
    public function get(int $user, string $id): object
    {
        return DB::table('agent_teammates')->where('user_id', $user)->where('id', $id)->firstOrFail();
    }

    public function save(int $user, array $data, ?string $id = null): array
    {
        return DB::transaction(function () use ($user, $data, $id) {
            app(Wallet::class)->lock($user);
            $fields = ['name' => trim($data['name']), 'brief' => trim($data['brief']), 'avatar' => $data['avatar'],
                'memory' => trim($data['memory'] ?? ''), 'budget' => (int) $data['budget'],
                'integrations' => json_encode(array_values(array_unique($data['integrations'] ?? [])))];
            abort_if($fields['name'] === '' || $fields['brief'] === '', 422, 'Give your teammate a name and a job.');
            if (array_key_exists('model', $data)) $fields['model'] = $data['model'];
            $skillIds = $data['skillIds'] ?? null;
            if ($skillIds !== null) sort($skillIds);
            $hash = hash('sha256', json_encode($skillIds === null ? $fields : [...$fields, 'skillIds' => $skillIds]));
            if ($id === null) {
                $id = $data['id'];
                $existing = DB::table('agent_teammates')->where('id', $id)->first();
                if ($existing) {
                    abort_unless($existing->user_id == $user && hash_equals($existing->create_hash, $hash), 409, 'This request already created a different teammate.');
                    return $this->payload($existing);
                }
                abort_if(DB::table('agent_teammates')->where('user_id', $user)->count() >= config('agents.max_teammates'), 422, 'Your teammate limit has been reached.');
            } else {
                $existing = $this->get($user, $id);
                $sameSkills = $skillIds === null || $skillIds === DB::table('agent_skill_assignments')->where('agent_id', $id)->orderBy('skill_id')->pluck('skill_id')->all();
                $same = $sameSkills && collect($fields)->every(fn ($value, $key) => $existing->$key == $value);
                if ($same && (int) $existing->revision === (int) $data['revision'] + 1) return $this->payload($existing);
                abort_unless((int) $existing->revision === (int) $data['revision'], 409, 'This teammate changed on another device. Reload its details.');
                $this->idle($existing);
                abort_if($existing->archived_at, 409, 'Restore this teammate before editing it.');
            }
            if (isset($fields['model']) && $fields['model'] !== 'auto' && EngineProviders::preference($fields['model']) === null && ($existing->model ?? null) !== $fields['model'])
                app(\App\Services\Vibes\Catalog::class)->resolve($fields['model'], app(Wallet::class)->planFor($user));
            if ($skillIds !== null) abort_unless(DB::table('agent_skills')->where('user_id', $user)->whereIn('id', $skillIds)->count() === count($skillIds), 422, 'Choose skills from your library.');
            $named = json_decode($fields['integrations'], true);
            abort_unless(count(app(ConnectorTools::class)->resolve($user, $named)) === count($named), 422, 'Connect each selected tool before giving it to your teammate.');
            if (isset($existing)) {
                DB::table('agent_teammates')->where('id', $id)->update([...$fields, 'revision' => $existing->revision + 1, 'updated_at' => now()]);
                DB::table('vibes_chats')->where('id', $existing->chat_id)->update(['title' => $fields['name'], 'revision' => DB::raw('revision + 1')]);
            } else {
                $chat = (string) Str::uuid();
                DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $user, 'title' => $fields['name'], 'agent_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('agent_teammates')->insert([...$fields, 'id' => $id, 'user_id' => $user, 'chat_id' => $chat,
                    'create_hash' => $hash, 'created_at' => now(), 'updated_at' => now()]);
            }
            if ($skillIds !== null) {
                $old = DB::table('agent_skill_assignments')->where('agent_id', $id)->pluck('skill_id')->all();
                DB::table('agent_skill_assignments')->where('agent_id', $id)->delete();
                foreach ($skillIds as $skill) DB::table('agent_skill_assignments')->insert(['agent_id' => $id, 'skill_id' => $skill]);
                $changed = array_unique([...array_diff($old, $skillIds), ...array_diff($skillIds, $old)]);
                DB::table('agent_skills')->whereIn('id', $changed)->increment('revision');
            }
            return $this->payload($this->get($user, $id));
        }, 5);
    }

    public function archive(int $user, string $id, bool $archive, int $revision): array
    {
        return DB::transaction(function () use ($user, $id, $archive, $revision) {
            app(Wallet::class)->lock($user);
            $a = $this->get($user, $id);
            if ((bool) $a->archived_at === $archive && in_array((int) $a->revision, [$revision, $revision + 1], true)) return $this->payload($a);
            abort_unless((int) $a->revision === $revision, 409, 'This teammate changed. Reload its details.');
            $this->idle($a);
            DB::table('agent_teammates')->where('id', $id)->update(['archived_at' => $archive ? now() : null, 'revision' => $revision + 1, 'updated_at' => now()]);
            DB::table('vibes_chats')->where('id', $a->chat_id)->increment('revision');
            return $this->payload($this->get($user, $id));
        });
    }

    private function idle(object $a): void
    {
        abort_if(DB::table('vibes_turns')->where('chat_id', $a->chat_id)->whereNull('settled_at')->exists(), 409, 'Stop the current task before changing this teammate.');
    }

    public function payload(object $a, ?object $last = null, bool $waiting = false, bool $projected = false): array
    {
        if (!$projected) $last = DB::table('vibes_turns')->where('chat_id', $a->chat_id)->orderByDesc('created_at')->orderByDesc('id')->first();
        if (!$projected) $waiting = $last && $last->status === 'waiting' && !$last->cancel_requested && !$last->settled_at
            && DB::table('vibes_tools')->where('turn_id', $last->id)->where('action_state', 'pending')->where('created_at', '>', now()->subMinutes(15))->exists();
        return ['id' => $a->id, 'chatId' => $a->chat_id, 'name' => $a->name, 'avatar' => $a->avatar, 'brief' => $a->brief,
            'model' => $a->model ?? 'auto', 'skillIds' => DB::table('agent_skill_assignments')->where('agent_id', $a->id)->orderBy('skill_id')->pluck('skill_id')->all(),
            'memory' => $a->memory, 'integrations' => json_decode($a->integrations, true), 'budget' => (int) $a->budget,
            'revision' => (int) $a->revision, 'archived' => (bool) $a->archived_at,
            'status' => $waiting ? 'needs_approval' : ($last->status ?? 'idle'),
            'lastMessage' => $waiting ? 'A step needs your approval.' : Str::limit($last->response ?? $last->error ?? $last->prompt ?? $a->brief, 180),
            'updatedAt' => $last->updated_at ?? $a->updated_at, 'lastRunId' => $last->id ?? null];
    }
}
