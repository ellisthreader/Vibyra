<?php

namespace App\Services\Agents;

use App\Services\Vibes\AgentTools;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Cloud half of a desktop grant. The canonical path and final permission stay on that computer. */
final class Workspaces
{
    public const WAIT_SECONDS = 604800;
    public function forAgent(object $agent): ?object
    {
        if (!config('agents.local_runner_enabled')) return null;
        return DB::table('agent_workspaces')->where('user_id', $agent->user_id)
            ->where('agent_id', $agent->id)->whereNull('revoked_at')->first();
    }

    public function register(int $user, string $agentId, string $hostId, string $label,
        bool $canWrite = false, string $platform = 'macos'): array
    {
        return DB::transaction(function () use ($user, $agentId, $hostId, $label, $canWrite, $platform) {
            $agent = DB::table('agent_teammates')->where('user_id', $user)->where('id', $agentId)->lockForUpdate()->firstOrFail();
            abort_if($agent->archived_at, 409, 'Restore this teammate first.');
            $host = DB::table('remote_hosts')->where('host_id', $hostId)->first();
            abort_if($host && ($host->user_id !== $user || $host->revoked_at), 409,
                'This computer identity is unavailable.');
            if (!$host) DB::table('remote_hosts')->insert(['user_id' => $user, 'host_id' => $hostId,
                'name' => 'Vibyra Agent Computer', 'platform' => $platform, 'registered_at' => now(),
                'created_at' => now(), 'updated_at' => now()]);
            abort_if(DB::table('vibes_turns')->where('chat_id', $agent->chat_id)->whereNull('settled_at')->exists(),
                409, 'Stop the current task before changing its computer.');
            DB::table('agent_workspaces')->where('user_id', $user)->where('agent_id', $agentId)
                ->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
            $id = (string) Str::uuid();
            $key = Str::random(64);
            DB::table('agent_workspaces')->insert(['id' => $id, 'user_id' => $user, 'agent_id' => $agentId,
                'host_id' => $hostId, 'label' => trim($label), 'can_write' => $canWrite,
                'runner_key_hash' => hash('sha256', $key),
                'created_at' => now(), 'updated_at' => now()]);
            DB::table('agent_teammates')->where('id', $agentId)->increment('revision');
            return ['id' => $id, 'hostId' => $hostId, 'label' => trim($label),
                'canWrite' => $canWrite, 'runnerKey' => $key];
        });
    }

    public function revoke(int $user, string $id): void
    {
        $removed = DB::transaction(function () use ($user, $id) {
            $grant = DB::table('agent_workspaces')->where('id', $id)->where('user_id', $user)->lockForUpdate()->firstOrFail();
            if ($grant->revoked_at) return false;
            DB::table('agent_workspaces')->where('id', $id)->update(['revoked_at' => now(), 'updated_at' => now()]);
            DB::table('agent_teammates')->where('id', $grant->agent_id)->increment('revision');
            return true;
        });
        if (!$removed) return;
        $turns = DB::table('vibes_tools')->join('vibes_turns', 'vibes_turns.id', '=', 'vibes_tools.turn_id')
            ->where('vibes_tools.agent_workspace_id', $id)->whereNull('vibes_tools.result')
            ->whereNull('vibes_turns.settled_at')->where('vibes_turns.user_id', $user)
            ->pluck('vibes_turns.id')->unique();
        foreach ($turns as $turnId) {
            $turn = DB::table('vibes_turns')->where('id', $turnId)->first();
            $inFlight = DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->where('operation', 'write_file')->where('action_state', 'dispatching')->exists();
            if ($inFlight) DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->where('operation', 'write_file')->where('action_state', 'dispatching')->update([
                    'action_state' => 'unknown', 'summary' => 'Computer edit outcome unconfirmed.', 'updated_at' => now()]);
            if ($turn) app(\App\Services\Vibes\Turns::class)->settle($turnId, $turn->actual_micro_usd, null,
                $inFlight ? 'Agent Computer access was removed while an approved edit was in progress. Check the file on your computer.'
                    : 'Agent Computer access was removed. Confirmed AI usage was charged; unused Vibes were returned.');
        }
    }

    public function authenticated(int $user, string $id, ?string $key): object
    {
        $grant = DB::table('agent_workspaces')->where('id', $id)->where('user_id', $user)
            ->whereNull('revoked_at')->firstOrFail();
        abort_unless(is_string($key) && strlen($key) === 64
            && hash_equals($grant->runner_key_hash, hash('sha256', $key)), 403, 'Invalid computer grant.');
        abort_unless(DB::table('remote_hosts')->where('user_id', $user)->where('host_id', $grant->host_id)
            ->whereNull('revoked_at')->exists(), 409, 'This computer was removed.');
        return $grant;
    }

    public function pending(object $grant): array
    {
        DB::table('agent_workspaces')->where('id', $grant->id)->whereNull('revoked_at')
            ->update(['last_seen_at' => now(), 'updated_at' => now()]);
        $rows = DB::table('vibes_tools')->join('vibes_turns', 'vibes_turns.id', '=', 'vibes_tools.turn_id')
            ->where('vibes_tools.agent_workspace_id', $grant->id)->whereNull('vibes_tools.result')
            ->whereNull('vibes_turns.settled_at')->where('vibes_turns.status', 'waiting')
            ->where('vibes_turns.cancel_requested', false)->where('vibes_tools.created_at', '>', now()->subSeconds(self::WAIT_SECONDS))
            ->orderBy('vibes_tools.created_at')->limit(4)
            ->get(['vibes_tools.*']);
        return $rows->filter(function ($tool) use ($grant) {
            if (in_array($tool->operation, AgentTools::readNames(), true)) return true;
            if ($tool->operation !== 'write_file' || !$grant->can_write) return false;
            try {
                $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->firstOrFail();
                app(ToolActions::class)->authorizedLocal($tool, $turn);
                return true;
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { return false; }
        })->map(fn ($tool) => ['id' => $tool->id, 'turnId' => $tool->turn_id,
            'operation' => $tool->operation, 'arguments' => json_decode($tool->arguments, true),
            'expiresAt' => AgentTools::expires($tool)->timestamp,
            'approval' => $tool->operation === 'write_file' ? ['state' => $tool->action_state,
                'fingerprint' => $tool->action_hash] : null])->values()->all();
    }

    public function respond(object $grant, string $id, array $result): void
    {
        abort_if(strlen(json_encode($result)) > 16000, 422, 'Tool output is too large.');
        $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)->firstOrFail();
        $write = $tool->operation === 'write_file';
        abort_unless(in_array($tool->operation, AgentTools::readNames(), true)
            || ($write && $grant->can_write), 409, 'This tool is outside the computer grant.');
        $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $grant->user_id)->firstOrFail();
        $meta = json_decode($turn->request, true)['vibyraAgent'] ?? [];
        abort_unless(($meta['workspaceId'] ?? null) === $grant->id
            && ($meta['workspaceRevision'] ?? null) === (int) $grant->revision,
            409, 'The computer grant changed. Start a new task.');
        TaskContext::validate($grant->user_id, $meta);
        if ($write) {
            if ($tool->result !== null) {
                app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result);
                return;
            }
            app(ToolActions::class)->authorizedLocal($tool, $turn);
            abort_unless($tool->action_state === 'dispatching', 409, 'The computer has not claimed this edit.');
            abort_unless(($result['written'] ?? false) === true || is_string($result['error'] ?? null),
                422, 'The computer did not return an edit receipt.');
            if (($result['written'] ?? false) === true) {
                $args = json_decode($tool->arguments, true);
                abort_unless(($result['path'] ?? null) === ($args['path'] ?? null)
                    && ($result['sha256'] ?? null) === hash('sha256', $args['content'] ?? ''),
                    422, 'The computer edit receipt does not match the approved file.');
            }
            if (isset($result['error'])) {
                DB::table('vibes_tools')->where('id', $id)->update(['result' => json_encode($result),
                    'decision' => 'allow', 'action_state' => 'unknown', 'summary' => 'Edit outcome unconfirmed.', 'updated_at' => now()]);
                app(\App\Services\Vibes\Turns::class)->settle($turn->id, $turn->actual_micro_usd,
                    null, 'The computer could not confirm this edit. Check the file before trying again.');
                return;
            }
        }
        app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result);
        if ($write) DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'completed',
            'summary' => 'Computer file edit completed.', 'updated_at' => now()]);
    }

    public function claim(object $grant, string $id, string $fingerprint): void
    {
        DB::transaction(function () use ($grant, $id, $fingerprint) {
            app(\App\Services\Vibes\Wallet::class)->lock($grant->user_id);
            abort_unless(DB::table('agent_workspaces')->where('id', $grant->id)->where('user_id', $grant->user_id)
                ->where('can_write', true)->whereNull('revoked_at')->lockForUpdate()->first(),
                409, 'This computer edit grant was removed.');
            $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)
                ->lockForUpdate()->firstOrFail();
            $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $grant->user_id)->firstOrFail();
            abort_unless($tool->action_hash && hash_equals($tool->action_hash, $fingerprint),
                409, 'This edit changed. Refresh before running it.');
            app(ToolActions::class)->authorizedLocal($tool, $turn);
            abort_unless($tool->result === null, 409, 'This edit already has a receipt.');
            if ($tool->action_state === 'queued') DB::table('vibes_tools')->where('id', $id)->update([
                'action_state' => 'dispatching', 'action_dispatched_at' => now(),
                'summary' => 'Approved computer edit in progress.', 'updated_at' => now(),
            ]);
        });
    }
}
