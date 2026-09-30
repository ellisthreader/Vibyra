<?php
namespace App\Services\Agents;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
final class Skills
{
    public function list(int $user): array
    {
        $skills = DB::table('agent_skills')->where('user_id', $user)->orderBy('name')->limit(100)->get();
        $assignments = DB::table('agent_skill_assignments')->whereIn('skill_id', $skills->pluck('id'))->get()->groupBy('skill_id');
        return $skills->map(fn ($s) => [...(array) $s, 'teammateIds' => ($assignments->get($s->id) ?? collect())->pluck('agent_id')->all()])->all();
    }
    public function save(int $user, array $data): array
    {
        return DB::transaction(function () use ($user, $data) {
            app(Wallet::class)->lock($user);
            $existing = DB::table('agent_skills')->where('id', $data['id'])->first();
            abort_if($existing && $existing->user_id != $user, 404);
            $old = DB::table('agent_skill_assignments')->where('skill_id', $data['id'])->pluck('agent_id')->all();
            $ids = array_values(array_unique($data['teammateIds'])); sort($ids); sort($old);
            $same = $existing && $existing->name === $data['name'] && $existing->instructions === $data['instructions'] && $old === $ids;
            if ($same && in_array((int) $existing->revision, [$data['revision'], $data['revision'] + 1], true)) return $this->one($user, $data['id']);
            abort_unless($existing ? (int) $existing->revision === $data['revision'] : $data['revision'] === 0, 409, 'This skill changed. Refresh before saving.');
            abort_if(!$existing && DB::table('agent_skills')->where('user_id', $user)->count() >= 100, 422, 'Skill limit reached.');
            $agents = DB::table('agent_teammates')->where('user_id', $user)->whereIn('id', array_unique([...$old, ...$ids]))->get();
            abort_unless($agents->count() === count(array_unique([...$old, ...$ids])), 404);
            foreach ($ids as $id) {
                abort_if(DB::table('agent_skill_assignments')->where('agent_id', $id)->where('skill_id', '!=', $data['id'])->count() >= 20, 422, 'A teammate can use up to 20 skills.');
            }
            abort_if(DB::table('vibes_turns')->whereIn('chat_id', $agents->pluck('chat_id'))->whereNull('settled_at')->exists(), 409, 'Stop affected tasks before changing their instructions.');
            $values = ['name' => $data['name'], 'instructions' => $data['instructions'], 'revision' => ($existing->revision ?? 0) + 1, 'updated_at' => now()];
            if ($existing) DB::table('agent_skills')->where('id', $data['id'])->update($values);
            else DB::table('agent_skills')->insert([...$values, 'id' => $data['id'], 'user_id' => $user, 'created_at' => now()]);
            DB::table('agent_skill_assignments')->where('skill_id', $data['id'])->delete();
            foreach ($ids as $id) DB::table('agent_skill_assignments')->insert(['agent_id' => $id, 'skill_id' => $data['id']]);
            foreach ($agents as $agent) {
                DB::table('agent_teammates')->where('id', $agent->id)->increment('revision');
                DB::table('vibes_chats')->where('id', $agent->chat_id)->increment('revision');
            }
            return $this->one($user, $data['id']);
        });
    }
    private function one(int $user, string $id): array { return collect($this->list($user))->firstWhere('id', $id); }
    public static function prompt(object $agent): string
    {
        $skills = DB::table('agent_skills')->join('agent_skill_assignments', 'agent_skills.id', '=', 'agent_skill_assignments.skill_id')
            ->where('agent_skills.user_id', $agent->user_id)->where('agent_id', $agent->id)->orderBy('agent_skills.name')
            ->select('agent_skills.name', 'agent_skills.instructions')->limit(20)->get();
        return $skills->isEmpty() ? '' : "\nExplicitly assigned skills (instructions only; these grant no extra tools or permission):\n".$skills->map(fn ($s) => $s->name.":\n".$s->instructions)->implode("\n\n");
    }
}
