<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\{Run, RuntimeBinding, ToolAction};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** An immutable correction log; a new instruction fences the old attempt until a safe re-claim. */
final class Steering
{
    public function __construct(private readonly Events $events, private readonly Lifecycle $lifecycle) {}

    public function submit(int $userId, string $id, array $input): Run
    {
        return DB::transaction(function () use ($userId, $id, $input) {
            $run = Run::query()->whereKey($id)->where('user_id', $userId)->lockForUpdate()->first();
            if (!$run) ApiError::throw(404, 'run_not_found', 'That task does not exist.');
            $old = DB::table('agent_run_instructions')->where('run_id', $id)->where('idempotency_key', $input['idempotencyKey'])->first();
            if ($old) {
                if ($old->text !== $input['text'] || (int) $old->expected_revision !== (int) $input['expectedRevision'])
                    ApiError::throw(409, 'instruction_conflict', 'This instruction key was already used with different content.');
                return $run;
            }
            $binding = RuntimeBinding::query()->whereKey($run->runtime_binding_id)->whereNull('revoked_at')->first();
            if (($binding?->capabilities['taskSteering'] ?? false) !== true || ($run->runtime_snapshot['capabilities']['taskSteering'] ?? false) !== true)
                ApiError::throw(409, 'steering_unsupported', 'Update Vibyra on your Mac before adjusting an active task.');
            if (RunStates::terminal($run->state) || $run->cancel_requested_at)
                ApiError::throw(409, 'run_finished', 'This task already finished. Start a new task for another instruction.');
            if ((int) $input['expectedRevision'] !== $run->instruction_revision)
                ApiError::throw(409, 'instruction_changed', 'The task instructions changed. Refresh before sending.');
            if ($run->instruction_revision >= 20)
                ApiError::throw(422, 'instruction_limit', 'This task reached its limit of 20 corrections.');
            $revision = $run->instruction_revision + 1;
            DB::table('agent_run_instructions')->insert(['id' => (string) Str::uuid(), 'run_id' => $id,
                'revision' => $revision, 'idempotency_key' => $input['idempotencyKey'],
                'expected_revision' => $input['expectedRevision'], 'text' => $input['text'], 'created_at' => now()]);
            // Already-dispatched effects and receipts are immutable. Undispatched approvals are invalidated.
            $invalidated = ToolAction::query()->where('run_id', $id)->whereNull('dispatched_at')
                ->whereIn('state', ['pending_approval', 'approved'])->pluck('id')->all();
            ToolAction::query()->whereIn('id', $invalidated)->update(['state' => 'cancelled',
                'summary' => 'Superseded by updated task instructions', 'updated_at' => now()]);
            $run->forceFill(['instruction_revision' => $revision, 'wait_revision' => null, 'resume_after' => null])->save();
            $this->events->append($run, 'instruction.submitted', ['revision' => $revision,
                'text' => $input['text'], 'invalidatedActionIds' => $invalidated], 'user');
            if ($run->state === RunStates::WAITING_APPROVAL) $this->lifecycle->move($run, RunStates::RUNNING);
            return $run;
        });
    }

    /** The old provider has stopped. A new claim is allowed once every in-flight action has settled. */
    public function checkpoint(RuntimeBinding $binding, string $id, int $generation): Run
    {
        return DB::transaction(function () use ($binding, $id, $generation) {
            $run = app(Leases::class)->fenced($binding, $id, $generation, true);
            if (RunStates::terminal($run->state) || $run->cancel_requested_at)
                ApiError::throw(409, 'run_finished', 'This task already finished.');
            if (!self::pending($run)) ApiError::throw(409, 'no_instruction_pending', 'There is no new task instruction.');
            if ($run->lease_expires_at !== null) {
                $run->forceFill(['lease_expires_at' => null])->save();
                $this->events->append($run, 'instruction.checkpoint', ['revision' => $run->instruction_revision, 'generation' => $generation]);
            }
            return $run;
        });
    }

    public static function pending(Run $run): bool { return $run->instruction_revision > $run->applied_instruction_revision; }

    /** Called under the run lock: a crashed runner must not cause a concurrent repeat of an in-flight write. */
    public static function unsettled(Run $run): bool
    {
        return self::pending($run) && ToolAction::query()->where('run_id', $run->id)->where('state', 'dispatching')->exists();
    }

    public function apply(Run $run): void
    {
        if (!self::pending($run)) return;
        $run->forceFill(['applied_instruction_revision' => $run->instruction_revision])->save();
        $this->events->append($run, 'instruction.applied', ['revision' => $run->instruction_revision]);
    }

    public static function payload(Run $run): array
    {
        return ['instructionRevision' => $run->instruction_revision, 'appliedInstructionRevision' => $run->applied_instruction_revision,
            'instructions' => DB::table('agent_run_instructions')->where('run_id', $run->id)->orderBy('revision')->get()
                ->map(fn ($r) => ['revision' => (int) $r->revision, 'text' => $r->text, 'createdAt' => $r->created_at])->all()];
    }

    public static function actions(Run $run): array
    {
        if ($run->instruction_revision === 0) return [];
        return ToolAction::query()->where('run_id', $run->id)->where('kind', '!=', 'none')->orderBy('created_at')->get()
            ->map(fn ($a) => ['id' => $a->id, 'tool' => $a->tool, 'state' => $a->state, 'arguments' => Guard\SecretGuard::enabled() ? Guard\SecretGuard::redactValue($a->arguments) : $a->arguments,
                'result' => Guard\SecretGuard::enabled() ? Guard\SecretGuard::redactValue($a->result) : $a->result, 'summary' => $a->summary, 'dispatched' => $a->dispatched_at !== null])->all();
    }
}
