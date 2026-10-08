<?php

namespace App\Services\Agents;

use App\Jobs\RunAgentTool;
use App\Services\ChatConnectors\ConnectorTools;
use App\Services\Vibes\{AgentTools, Wallet};
use Illuminate\Support\Facades\DB;

/** Durable intent before dispatch. An uncertain external write is never replayed. */
class ToolActions
{
    public function prepare(string $turnId, int $user): void
    {
        DB::transaction(function () use ($turnId, $user) {
            app(Wallet::class)->lock($user);
            $turn = DB::table('vibes_turns')->where('id', $turnId)->where('user_id', $user)->firstOrFail();
            $meta = json_decode($turn->request, true)['vibyraAgent'];
            foreach (DB::table('vibes_tools')->where('turn_id', $turnId)->whereNull('result')->get() as $tool) {
                if ($tool->action_state !== null) continue;
                $localWrite = $tool->agent_workspace_id && $tool->operation === 'write_file';
                if (!$tool->integration && !$localWrite) continue;
                if ($localWrite) {
                    TaskContext::validate($user, $meta);
                    abort_unless(DB::table('agent_workspaces')->where('id', $tool->agent_workspace_id)
                        ->where('user_id', $user)->where('can_write', true)->whereNull('revoked_at')->exists(),
                        409, 'This computer cannot edit the project.');
                }
                $write = $localWrite || app(ToolPolicy::class)->requiresApproval($tool->integration, $tool->operation);
                $hash = $this->fingerprint($user, $turnId, $tool, $meta);
                DB::table('vibes_tools')->where('id', $tool->id)->update([
                    'action_state' => $write ? 'pending' : 'queued', 'action_hash' => $hash,
                    'summary' => $write ? 'Review this action before it runs.' : 'Reading '.$tool->integration.'…', 'updated_at' => now(),
                ]);
                if (!$write) RunAgentTool::dispatch($tool->id)->afterCommit();
            }
            app(\App\Services\Progress\WorkEvents::class)->observe($turnId);
        });
    }

    public function decide(int $user, string $id, string $hash, string $answer): void
    {
        abort_unless(in_array($answer, ['allow', 'decline'], true), 422, 'Choose Allow or Deny.');
        DB::transaction(function () use ($user, $id, $hash, $answer) {
            app(Wallet::class)->lock($user);
            [$tool, $turn] = $this->owned($id, $user);
            abort_unless($tool->action_hash && hash_equals($tool->action_hash, $hash), 409, 'This action changed. Refresh before deciding.');
            if ($tool->action_answer) {
                abort_unless($tool->action_answer === $answer, 409, 'This action already has a different decision.');
                return;
            }
            abort_unless($tool->action_state === 'pending', 409, 'This action is no longer waiting for approval.');
            $this->eligible($tool, $turn);
            DB::table('vibes_tools')->where('id', $id)->update(['action_answer' => $answer,
                'action_state' => $answer === 'allow' ? 'queued' : 'declined', 'updated_at' => now()]);
            if ($answer === 'allow') {
                if ($tool->integration) RunAgentTool::dispatch($id)->afterCommit();
            } else app(AgentTools::class)->respond($user, $id, 'decline', ['declined' => true]);
        });
    }

    public function execute(string $id): void
    {
        $work = DB::transaction(function () use ($id) {
            $first = DB::table('vibes_tools')->where('id', $id)->firstOrFail();
            $owner = DB::table('vibes_turns')->where('id', $first->turn_id)->value('user_id');
            app(Wallet::class)->lock($owner);
            [$tool, $turn] = $this->owned($id, $owner);
            if (!$tool->integration) return null;
            if ($tool->action_state !== 'queued' || $tool->result !== null) return null;
            try { $this->eligible($tool, $turn, true); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'expired', 'summary' => $e->getMessage()]);
                if (!$turn->settled_at) app(\App\Services\Vibes\Turns::class)->settle($turn->id, $turn->actual_micro_usd, null, $e->getMessage());
                return null;
            }
            DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'dispatching', 'action_dispatched_at' => now()]);
            return [$tool, $turn];
        });
        if (!$work) return;
        [$tool, $turn] = $work;
        $outcome = app(ConnectorTools::class)->run($turn->user_id, $tool->integration, $tool->operation, json_decode($tool->arguments, true));
        $uncertain = isset($outcome['result']['error']);
        if ($uncertain) $outcome['result']['notice'] = 'The outcome could not be confirmed. Do not repeat a write automatically; check the connected service first.';
        DB::table('vibes_tools')->where('id', $id)->update(['action_state' => $uncertain ? 'unknown' : 'completed',
            'summary' => $outcome['summary'], 'updated_at' => now()]);
        try { app(AgentTools::class)->respond($turn->user_id, $id, $tool->action_answer ?? 'auto', $outcome['result']); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if ($e->getStatusCode() !== 409) throw $e;
            // A stop during dispatch keeps the receipt without resuming the AI.
            DB::table('vibes_tools')->where('id', $id)->whereNull('result')->update([
                'result' => json_encode($outcome['result']), 'decision' => $tool->action_answer ?? 'auto', 'updated_at' => now(),
            ]);
        }
    }

    private function owned(string $id, int $user): array
    {
        $tool = DB::table('vibes_tools')->where('id', $id)
            ->where(fn ($q) => $q->whereNotNull('integration')->orWhereNotNull('agent_workspace_id'))
            ->firstOrFail();
        return [$tool, DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $user)->firstOrFail()];
    }

    public function authorizedLocal(object $tool, object $turn): void
    {
        abort_unless($tool->integration === null && $tool->agent_workspace_id
            && $tool->operation === 'write_file' && in_array($tool->action_state, ['queued', 'dispatching'], true)
            && $tool->action_answer === 'allow', 409, 'This edit still needs approval.');
        $this->eligible($tool, $turn);
    }

    private function eligible(object $tool, object $turn, bool $dispatch = false): void
    {
        abort_unless($turn->status === 'waiting' && !$turn->settled_at && !$turn->cancel_requested, 409, 'This task is no longer active.');
        abort_if(now()->greaterThanOrEqualTo(AgentTools::expires($tool)), 409, 'This action expired. Send a new task.');
        $meta = json_decode($turn->request, true)['vibyraAgent'] ?? [];
        TaskContext::validate($turn->user_id, $meta);
        abort_unless($tool->action_hash && hash_equals($tool->action_hash,
            $this->fingerprint($turn->user_id, $turn->id, $tool, $meta)),
            409, 'This action changed. Start a new task.');
        if ($tool->integration) {
            abort_unless(in_array($tool->integration, $meta['integrations'] ?? [], true)
                && in_array($tool->integration, app(ConnectorTools::class)->resolve($turn->user_id, [$tool->integration]), true),
                409, 'This teammate no longer has access to '.$tool->integration.'.');
        } else {
            abort_unless($tool->agent_workspace_id === ($meta['workspaceId'] ?? null)
                && DB::table('agent_workspaces')->where('id', $tool->agent_workspace_id)
                    ->where('user_id', $turn->user_id)->where('can_write', true)->whereNull('revoked_at')->exists(),
                409, 'This computer edit grant changed.');
        }
        // A queued database state alone never grants an external write. Recheck
        // immediately before dispatch in case a queue or policy path changed.
        if ($dispatch && app(ToolPolicy::class)->requiresApproval($tool->integration, $tool->operation)) {
            abort_unless($tool->action_answer === 'allow' && $tool->action_hash,
                409, 'This action still needs approval.');
        }
    }

    private function fingerprint(int $user, string $turnId, object $tool, array $meta): string
    {
        return hash('sha256', json_encode([$user, $turnId, $tool->id, $tool->operation, $tool->arguments, $meta]));
    }
}
