<?php

namespace App\Services\AgentRuns\Outputs;

use App\Models\AgentV2\{Output, Run, ToolAction};
use App\Services\AgentRuns\{ApiError, Events};
use App\Services\AgentRuns\Tools\Providers\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Outputs
{
    public static function enabled(): void
    {
        if (!config('agents_v2.outputs_enabled')) ApiError::throw(503, 'outputs_disabled', 'Saved outputs are not enabled.');
    }

    public function find(int $userId, string $id): Output
    {
        self::enabled();
        abort_unless(Str::isUuid($id), 422, 'Use a valid output ID.');
        $output = Output::query()->whereKey($id)->where('user_id', $userId)->first();
        if (!$output) ApiError::throw(404, 'output_not_found', 'That output does not exist.');
        return $output;
    }

    public function list(int $userId, string $agentId): array
    {
        self::enabled();
        if (!DB::table('agent_teammates')->where('id', $agentId)->where('user_id', $userId)->exists())
            ApiError::throw(404, 'agent_not_found', 'That teammate does not exist.');
        return Output::query()->where('user_id', $userId)->where('agent_id', $agentId)
            ->orderByDesc('updated_at')->orderBy('id')->limit(100)->get()->map(fn ($o) => $this->payload($o))->all();
    }

    public function revisionTag(Run $run): string
    {
        if (!config('agents_v2.outputs_enabled')) return '';
        $versions = Output::query()->where('user_id', $run->user_id)->where('agent_id', $run->agent_id)
            ->whereIn('id', DB::table('agent_output_revisions')->where('run_id', $run->id)->select('output_id'))
            ->orderBy('id')->limit(100)->get(['id', 'revision'])->toArray();
        return \App\Services\AgentRuns\Canonical::hash($versions);
    }

    public function forRun(Run $run): array
    {
        if (!config('agents_v2.outputs_enabled')) return [];
        return Output::query()->where('user_id', $run->user_id)->where('agent_id', $run->agent_id)
            ->whereIn('id', DB::table('agent_output_revisions')->where('run_id', $run->id)->select('output_id'))
            ->orderBy('created_at')->limit(100)->get()->map(fn ($o) => $this->payload($o))->all();
    }

    /** Called inside the broker's fenced run transaction. Lock order: current run → output. */
    public function save(Run $run, array $args): Output
    {
        self::enabled();
        Schema::only($args, ['id', 'revision', 'kind', 'title', 'content', 'sourceActionIds']);
        $sources = $this->sources($run, $args['sourceActionIds'] ?? []);
        if (array_key_exists('id', $args)) {
            abort_unless(is_string($args['id']) && Str::isUuid($args['id']), 422, 'Use a valid output ID.');
            $output = Output::query()->whereKey($args['id'])->where('user_id', $run->user_id)
                ->where('agent_id', $run->agent_id)->lockForUpdate()->first();
            if (!$output) ApiError::throw(404, 'output_not_found', 'That output does not belong to this teammate.');
            if (($args['kind'] ?? $output->kind) !== $output->kind) abort(422, 'An output keeps its original kind.');
            $output = $this->revise($output, $args, $run->id, $sources, 'agent');
            app(Events::class)->append($run, 'output.revised', ['outputId' => $output->id, 'revision' => $output->revision]);
            return $output;
        }
        abort_unless(!isset($args['revision']), 422, 'New outputs do not have a revision yet.');
        $this->reserve($run);
        $kind = $args['kind'] ?? '';
        abort_unless(is_string($kind) && is_array($args['content'] ?? null), 422, 'Choose a kind and structured content.');
        $output = Output::query()->create(['user_id' => $run->user_id, 'agent_id' => $run->agent_id, 'run_id' => $run->id,
            'revision' => 1, 'kind' => $kind, 'title' => Schema::line($args['title'] ?? null, 160, 'Add a short title.'),
            'content' => OutputContent::validate($kind, $args['content']), 'sources' => $sources]);
        $this->record($output, $run->id, 'agent');
        app(Events::class)->append($run, 'output.saved', ['outputId' => $output->id, 'revision' => 1, 'kind' => $kind]);
        return $output;
    }

    public function edit(int $userId, string $id, array $args): Output
    {
        return DB::transaction(function () use ($userId, $id, $args) {
            $this->find($userId, $id);
            // Human edits lock only the output: do not take run locks after it.
            $output = Output::query()->whereKey($id)->where('user_id', $userId)->lockForUpdate()->firstOrFail();
            return $this->revise($output, $args, $output->run_id, $output->sources, 'person');
        });
    }

    private function revise(Output $output, array $args, string $runId, array $sources, string $author): Output
    {
        if (!is_int($args['revision'] ?? null) || $args['revision'] !== $output->revision)
            ApiError::throw(409, 'stale_output', 'This output changed. Reopen it before saving.');
        abort_unless($output->revision < 200, 422, 'This output has reached its revision limit.');
        abort_unless(is_array($args['content'] ?? null), 422, 'Provide structured content.');
        $output->forceFill(['revision' => $output->revision + 1,
            'title' => Schema::line($args['title'] ?? null, 160, 'Add a short title.'),
            'content' => OutputContent::validate($output->kind, $args['content']), 'sources' => $sources])->save();
        $this->record($output, $runId, $author);
        return $output;
    }

    private function sources(Run $run, mixed $ids): array
    {
        abort_unless(is_array($ids) && array_is_list($ids) && count($ids) <= 20, 422, 'Use at most 20 source action IDs.');
        foreach ($ids as $id) {
            abort_unless(is_string($id) && Str::isUuid($id) && ToolAction::query()->whereKey($id)->where('run_id', $run->id)
                ->where('user_id', $run->user_id)->where('state', 'completed')->exists(), 422, 'Sources must be completed actions from this task.');
        }
        return ['runId' => $run->id, 'actionIds' => array_values(array_unique($ids))];
    }

    private function reserve(Run $run): void
    {
        // Dedicated quota lock, not an account/agent lock: order run → quota only, with no inverse callers.
        DB::table('agent_output_quotas')->insertOrIgnore(['agent_id' => $run->agent_id, 'user_id' => $run->user_id, 'count' => 0]);
        $quota = DB::table('agent_output_quotas')->where('agent_id', $run->agent_id)->lockForUpdate()->first();
        abort_unless($quota && $quota->user_id == $run->user_id && $quota->count < 100, 422, 'This teammate has reached 100 saved outputs.');
        DB::table('agent_output_quotas')->where('agent_id', $run->agent_id)->increment('count');
    }

    private function record(Output $output, string $runId, string $author): void
    {
        DB::table('agent_output_revisions')->insert(['output_id' => $output->id, 'run_id' => $runId,
            'revision' => $output->revision, 'title' => $output->title, 'content' => json_encode($output->content),
            'sources' => json_encode($output->sources), 'author' => $author, 'created_at' => now()]);
    }

    public function payload(Output $o): array
    {
        return ['id' => $o->id, 'agentId' => $o->agent_id, 'runId' => $o->run_id, 'revision' => $o->revision,
            'kind' => $o->kind, 'title' => $o->title, 'content' => $o->content, 'sources' => $o->sources,
            'createdAt' => $o->created_at?->toIso8601String(), 'updatedAt' => $o->updated_at?->toIso8601String()];
    }
}
