<?php

namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Job, Run, RuntimeBinding};
use App\Services\AgentRuns\{ApiError, RunStates};
use Illuminate\Support\Facades\DB;

/** A slot cannot be reused while its previous attempt owns a live lease. */
final class Slots
{
    public static function available(RuntimeBinding $binding, ?int $slot): bool
    {
        if (!AccountLock::enabled($binding->user_id)) return $slot === null || $slot === 0;
        $slot ??= 0;
        if ($slot < 0 || $slot >= Capacity::RUNNING || ($slot > 0 && !Capacity::supports($binding)))
            ApiError::throw(409, 'runtime_upgrade', 'This runtime cannot use that execution slot.');
        if (Capacity::active($binding->user_id)->count() >= Capacity::RUNNING) return false;
        $previous = DB::table('agent_runtime_slots')->where('binding_id', $binding->id)->where('slot', $slot)->first();
        return !$previous?->run_id || !Capacity::active($binding->user_id)->whereKey($previous->run_id)->exists();
    }

    public static function eligible(RuntimeBinding $binding, Run $run, ?int $slot): bool
    {
        $mode = Contexts::mode($run);
        if ($mode !== 'ordered' && !Membership::allows($binding->user_id)) return false;
        if ($mode !== 'ordered' && (!self::modeEnabled($mode) || $slot === null || !Capacity::supports($binding))) return false;
        if (!AccountLock::enabled($binding->user_id)) return true;
        return self::available($binding, $slot);
    }

    public static function assign(RuntimeBinding $binding, Run $run, ?int $slot): void
    {
        if (!AccountLock::enabled($binding->user_id)) return;
        Job::query()->updateOrCreate(['run_id' => $run->id], ['user_id' => $run->user_id,
            'mode' => Contexts::mode($run), 'slot_generation' => $run->lease_generation]);
        if (Contexts::mode($run) === 'ordered') Job::query()->whereKey($run->id)->update(['write_epoch' =>
            (int) DB::table('agent_job_accounts')->where('user_id', $run->user_id)->value('write_epoch')]);
        DB::table('agent_runtime_slots')->updateOrInsert(['binding_id' => $binding->id, 'slot' => $slot ?? 0],
            ['run_id' => $run->id, 'generation' => $run->lease_generation]);
    }

    /** Called before any runner mutation. Replacing a slot fences its older process. */
    public static function fence(RuntimeBinding $binding, string $runId, bool $receiptOnly = false, bool $factualReceipt = false): void
    {
        $run = Run::query()->whereKey($runId)->where('user_id', $binding->user_id)->first();
        if (!$run) return;
        $job = Job::query()->find($runId); $mode = $job?->mode ?? 'ordered';
        if (!AccountLock::enabled($binding->user_id) && !$job?->slot_generation && $mode === 'ordered') return;
        if (!$receiptOnly && $mode !== 'ordered' && !self::modeEnabled($mode))
            ApiError::throw(409, 'job_mode_disabled', 'This execution mode was disabled. No new effects may run.');
        if (!$receiptOnly && $mode !== 'ordered') Membership::require($binding->user_id);
        $fresh = self::binding($binding);
        if (!$receiptOnly && $mode !== 'ordered' && !Capacity::supports($fresh))
            ApiError::throw(409, 'runtime_upgrade', 'The replacement runtime cannot execute independent jobs.');
        // Unclaimed legacy tasks have no slot; their existing generation check remains authoritative.
        if ($mode === 'ordered' && !Job::query()->whereKey($runId)->value('slot_generation')) return;
        if (!$factualReceipt && !DB::table('agent_runtime_slots')->where('binding_id', $binding->id)->where('run_id', $runId)
            ->where('generation', $run->lease_generation)->exists())
            ApiError::throw(409, 'stale_job_slot', 'This worker no longer owns its execution slot.');
    }

    private static function modeEnabled(string $mode): bool
    {
        return (bool) config($mode === 'coordinated' ? 'agents_v2.coordination_enabled' : 'agents_v2.parallel_jobs_enabled');
    }

    public static function binding(RuntimeBinding $binding): RuntimeBinding
    {
        $fresh = RuntimeBinding::query()->whereKey($binding->id)->lockForUpdate()->first();
        if (!$fresh || $fresh->revoked_at || !hash_equals((string) $fresh->runner_key_hash, (string) $binding->runner_key_hash))
            ApiError::throw(409, 'runtime_changed', 'The runtime registration changed. Reconnect before doing more work.');
        return $fresh;
    }

    public static function payload(Run $run): array
    {
        $mode = Contexts::mode($run);
        $slot = DB::table('agent_runtime_slots')->where('run_id', $run->id)->where('generation', $run->lease_generation)->value('slot');
        $reason = null;
        if (!RunStates::terminal($run->state) && (!$run->lease_expires_at || $run->lease_expires_at->isPast())) {
            $binding = RuntimeBinding::query()->find($run->runtime_binding_id);
            if ($mode !== 'ordered' && !self::modeEnabled($mode)) $reason = 'job_mode_disabled';
            elseif ($mode !== 'ordered' && !Membership::allows($run->user_id)) $reason = 'membership_required';
            elseif ($mode !== 'ordered' && (!$binding || !Capacity::supports($binding))) $reason = 'runtime_upgrade';
            elseif (Capacity::active($run->user_id)->count() >= Capacity::RUNNING) $reason = 'capacity';
            elseif ($mode === 'ordered' && Run::query()->where('user_id', $run->user_id)->where('agent_id', $run->agent_id)
                ->where('conversation_seq', '<', $run->conversation_seq)->whereNotIn('state', RunStates::TERMINAL)
                ->whereNotIn('id', Job::query()->where('mode', '!=', 'ordered')->select('run_id'))->exists()) $reason = 'earlier_turn';
        }
        return ['mode' => $mode, 'queueReason' => $reason, 'slot' => $slot === null ? null : (int) $slot];
    }
}
