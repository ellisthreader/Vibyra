<?php

namespace App\Services\Agents;

use App\Services\Vibes\AgentTools;
use App\Services\Agents\BranchPublication\BranchAction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Cloud half of a computer grant. The canonical path and final permission stay local. */
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
        bool $canWrite = false, bool $canTest = false, ?string $platform = null): array
    {
        abort_if($canTest && (!$canWrite || !config('agents.vm_tests_enabled')), 422,
            'VM shell tests need an edit worktree and a separate enabled test grant.');
        return DB::transaction(function () use ($user, $agentId, $hostId, $label, $canWrite, $canTest, $platform) {
            $agent = DB::table('agent_teammates')->where('user_id', $user)->where('id', $agentId)->lockForUpdate()->firstOrFail();
            abort_if($agent->archived_at, 409, 'Restore this teammate first.');
            $host = DB::table('remote_hosts')->where('host_id', $hostId)->first();
            abort_if($host && ($host->user_id !== $user || $host->revoked_at), 409,
                'This computer identity is unavailable.');
            $effectivePlatform = $platform ?? $host?->platform;
            abort_if($canTest && !VmPlatform::supports($platform), 422,
                'VM shell tests are currently available only on Mac.');
            if (!$host) DB::table('remote_hosts')->insert(['user_id' => $user, 'host_id' => $hostId,
                'name' => 'Vibyra Agent Computer', 'platform' => $effectivePlatform, 'registered_at' => now(),
                'created_at' => now(), 'updated_at' => now()]);
            elseif ($platform !== null && $host->platform !== $platform) DB::table('remote_hosts')
                ->where('host_id', $hostId)->where('user_id', $user)->update(['platform' => $platform, 'updated_at' => now()]);
            abort_if(DB::table('vibes_turns')->where('chat_id', $agent->chat_id)->whereNull('settled_at')->exists(),
                409, 'Stop the current task before changing its computer.');
            DB::table('agent_workspaces')->where('user_id', $user)->where('agent_id', $agentId)
                ->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
            $id = (string) Str::uuid();
            $key = Str::random(64);
            DB::table('agent_workspaces')->insert(['id' => $id, 'user_id' => $user, 'agent_id' => $agentId,
                'host_id' => $hostId, 'label' => trim($label), 'can_write' => $canWrite,
                'can_test' => $canTest,
                'runner_key_hash' => hash('sha256', $key),
                'created_at' => now(), 'updated_at' => now()]);
            DB::table('agent_teammates')->where('id', $agentId)->increment('revision');
            return ['id' => $id, 'hostId' => $hostId, 'label' => trim($label),
                'canWrite' => $canWrite, 'canTest' => $canTest, 'runnerKey' => $key];
        });
    }

    public function revoke(int $user, string $id): void
    {
        app(WorkspaceRevocation::class)->revoke($user, $id);
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
            if ($tool->operation === BranchAction::PREVIEW)
                return $grant->can_write && config('agents.git_publish_enabled');
            if (in_array($tool->operation, AgentTools::readNames(), true)) return true;
            if (!($tool->operation === 'write_file' && $grant->can_write)
                && !($tool->operation === 'run_test' && VmPlatform::allows($grant))
                && !($tool->operation === BranchAction::PUBLISH && $grant->can_write
                    && config('agents.git_publish_enabled'))) return false;
            try {
                $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->firstOrFail();
                app(ToolActions::class)->authorizedLocal($tool, $turn);
                return true;
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { return false; }
        })->map(fn ($tool) => ['id' => $tool->id, 'turnId' => $tool->turn_id,
            'operation' => $tool->operation,
            'arguments' => $tool->operation === BranchAction::PREVIEW
                ? (object) [] : json_decode($tool->arguments, true),
            'expiresAt' => AgentTools::expires($tool)->timestamp,
            'approval' => in_array($tool->operation, ['write_file', 'run_test', BranchAction::PUBLISH], true) ? ['state' => $tool->action_state,
                'fingerprint' => $tool->action_hash] : null])->values()->all();
    }

    public function respond(object $grant, string $id, array $result): void
    {
        abort_if(strlen(json_encode($result)) > 16000, 422, 'Tool output is too large.');
        $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)->firstOrFail();
        $write = $tool->operation === 'write_file';
        $test = $tool->operation === 'run_test';
        $publish = $tool->operation === BranchAction::PUBLISH;
        abort_unless(in_array($tool->operation, AgentTools::readNames(), true)
            || ($tool->operation === BranchAction::PREVIEW && $grant->can_write
                && config('agents.git_publish_enabled'))
            || ($write && $grant->can_write)
            || ($test && VmPlatform::allows($grant))
            || ($publish && $grant->can_write && config('agents.git_publish_enabled')),
            409, 'This tool is outside the computer grant.');
        abort_if($tool->operation === BranchAction::PREVIEW
            && (!$grant->can_write || !config('agents.git_publish_enabled')), 409,
            'Branch preview is no longer available.');
        $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $grant->user_id)->firstOrFail();
        $meta = json_decode($turn->request, true)['vibyraAgent'] ?? [];
        abort_unless(($meta['workspaceId'] ?? null) === $grant->id
            && ($meta['workspaceRevision'] ?? null) === (int) $grant->revision,
            409, 'The computer grant changed. Start a new task.');
        TaskContext::validate($grant->user_id, $meta);
        if ($tool->operation === BranchAction::PREVIEW)
            BranchAction::previewReceipt($result, $grant->id);
        if ($write || $test || $publish) {
            if ($tool->result !== null) {
                app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result);
                return;
            }
            app(ToolActions::class)->authorizedLocal($tool, $turn);
            abort_unless($tool->action_state === 'dispatching', 409, 'This computer has not claimed this action.');
        }
        if ($publish) {
            abort_unless(array_keys($result) === ['error'] && is_string($result['error'])
                && strlen($result['error']) <= 500, 422,
                'Only a local snapshot refusal can use the ordinary result route.');
            app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result);
            DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'completed',
                'summary' => 'Worktree changed before publication.', 'updated_at' => now()]);
            return;
        }
        if ($test) VmTestAction::receipt(json_decode($tool->arguments, true), $result);
        if ($write) {
            abort_unless(($result['written'] ?? false) === true || is_string($result['error'] ?? null),
                422, 'This computer did not return an edit receipt.');
            if (($result['written'] ?? false) === true) {
                $args = json_decode($tool->arguments, true);
                abort_unless(($result['path'] ?? null) === ($args['path'] ?? null)
                    && ($result['sha256'] ?? null) === hash('sha256', $args['content'] ?? ''),
                    422, 'The edit receipt does not match the approved file.');
            }
            if (isset($result['error'])) {
                DB::table('vibes_tools')->where('id', $id)->update(['result' => json_encode($result),
                    'decision' => 'allow', 'action_state' => 'unknown', 'summary' => 'Edit outcome unconfirmed.', 'updated_at' => now()]);
                app(\App\Services\Vibes\Turns::class)->settle($turn->id, $turn->actual_micro_usd,
                    null, 'This computer could not confirm the edit. Check the file before trying again.');
                return;
            }
        }
        app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result);
        if ($write) DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'completed',
            'summary' => 'Computer file edit completed.', 'updated_at' => now()]);
        if ($test) DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'completed',
            'summary' => isset($result['error']) ? 'Mac shell test result was not confirmed.'
                : ($result['timedOut'] ? 'Mac shell test timed out.' : 'Mac shell test exited '.$result['exitCode'].'.'),
            'updated_at' => now()]);
    }

    public function claim(object $grant, string $id, string $fingerprint): void
    {
        DB::transaction(function () use ($grant, $id, $fingerprint) {
            app(\App\Services\Vibes\Wallet::class)->lock($grant->user_id);
            $current = DB::table('agent_workspaces')->where('id', $grant->id)->where('user_id', $grant->user_id)
                ->whereNull('revoked_at')->lockForUpdate()->first();
            abort_unless($current, 409, 'This computer grant was removed.');
            $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)
                ->lockForUpdate()->firstOrFail();
            abort_unless(($tool->operation === 'write_file' && $current->can_write)
                || ($tool->operation === 'run_test' && VmPlatform::allows($current))
                || ($tool->operation === BranchAction::PUBLISH && $current->can_write
                    && config('agents.git_publish_enabled')),
                409, 'This computer grant does not allow the claimed action.');
            $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $grant->user_id)->firstOrFail();
            abort_unless($tool->action_hash && hash_equals($tool->action_hash, $fingerprint),
                409, 'This computer action changed. Refresh before running it.');
            app(ToolActions::class)->authorizedLocal($tool, $turn);
            abort_unless($tool->result === null, 409, 'This computer action already has a receipt.');
            if ($tool->action_state === 'queued') DB::table('vibes_tools')->where('id', $id)->update([
                'action_state' => 'dispatching', 'action_dispatched_at' => now(),
                'summary' => $tool->operation === 'run_test' ? 'Approved Mac shell test in progress.'
                    : ($tool->operation === BranchAction::PUBLISH ? 'Approved branch snapshot in progress.'
                        : 'Approved computer edit in progress.'), 'updated_at' => now(),
            ]);
        });
    }
}
