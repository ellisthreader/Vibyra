<?php

namespace App\Services\Agents\BranchPublication;

use App\Services\Agents\{TaskContext, ToolActions};
use App\Services\ChatConnectors\Installs;
use App\Services\Vibes\{AgentTools, Turns, Wallet};
use App\Jobs\PublishAgentBranch;
use Illuminate\Support\Facades\DB;

/** One claimed, exact-approved upload. A started GitHub write is never replayed. */
final class BranchDelivery
{
    public function submit(object $grant, string $id, array $upload): array
    {
        abort_unless(config('agents.git_publish_enabled') && $grant->can_write, 409,
            'Agent branch publishing is unavailable for this computer.');
        Manifest::validate($upload, $grant->id);
        $metadata = $upload;
        foreach ($metadata['files'] as &$file) unset($file['contentBase64']);
        unset($file);
        $metadata = Manifest::metadata($metadata, $grant->id);
        DB::transaction(function () use ($grant, $id, $metadata) {
            app(Wallet::class)->lock($grant->user_id);
            $current = DB::table('agent_workspaces')->where('id', $grant->id)
                ->where('user_id', $grant->user_id)->whereNull('revoked_at')->lockForUpdate()->first();
            abort_unless($current && $current->can_write, 409, 'This Mac edit grant changed.');
            $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)
                ->lockForUpdate()->firstOrFail();
            abort_unless($tool->operation === BranchAction::PUBLISH && $tool->result === null
                && $tool->action_state === 'dispatching', 409,
                'This branch action was not claimed or already started.');
            $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)
                ->where('user_id', $grant->user_id)->firstOrFail();
            app(ToolActions::class)->authorizedLocal($tool, $turn);
            $context = json_decode($turn->request, true)['vibyraAgent'] ?? [];
            TaskContext::validate($grant->user_id, $context);
            $args = BranchAction::arguments(BranchAction::PUBLISH,
                json_decode($tool->arguments, true), $grant->id);
            abort_unless($args['snapshot'] === $metadata, 409,
                'The Mac worktree changed after approval. Review a fresh snapshot.');
            DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'publishing',
                'summary' => 'Approved GitHub branch publication in progress.', 'updated_at' => now()]);
        });
        try {
            PublishAgentBranch::dispatch($grant->id, $id, $upload);
        } catch (\Throwable) {
            $this->finish($grant, $id, ['published' => false,
                'error' => 'The GitHub publication could not be queued. Inspect this task before trying again.']);
            return ['accepted' => false];
        }
        return ['accepted' => true];
    }

    public function run(string $workspaceId, string $id, array $upload): void
    {
        $grant = DB::table('agent_workspaces')->where('id', $workspaceId)->firstOrFail();
        try {
            $manifest = Manifest::validate($upload, $workspaceId);
            $metadata = $upload;
            foreach ($metadata['files'] as &$file) unset($file['contentBase64']);
            unset($file);
            $metadata = Manifest::metadata($metadata, $workspaceId);
            $args = DB::transaction(function () use ($grant, $id, $metadata) {
                app(Wallet::class)->lock($grant->user_id);
                $tool = DB::table('vibes_tools')->where('id', $id)
                    ->where('agent_workspace_id', $grant->id)->lockForUpdate()->firstOrFail();
                if ($tool->action_state !== 'publishing' || $tool->result !== null) return null;
                $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)
                    ->where('user_id', $grant->user_id)->firstOrFail();
                app(ToolActions::class)->authorizedLocal($tool, $turn);
                $args = BranchAction::arguments(BranchAction::PUBLISH,
                    json_decode($tool->arguments, true), $grant->id);
                abort_unless($args['snapshot'] === $metadata, 409, 'The approved snapshot changed.');
                DB::table('vibes_tools')->where('id', $id)->update(['action_state' => 'writing',
                    'summary' => 'Approved GitHub branch write in progress.', 'updated_at' => now()]);
                return $args;
            });
            if ($args === null) return; // A duplicate queue delivery never replays a write.
        } catch (\Throwable) {
            $this->finish($grant, $id, ['published' => false, 'refused' => true,
                'reason' => 'The approved task, connection or snapshot changed before GitHub was contacted.']);
            return;
        }
        try {
            $token = app(Installs::class)->credential($grant->user_id, 'github');
            $result = app(Publisher::class)->publish($token, $args['repository'],
                $args['baseBranch'], $args['message'], $manifest);
        } catch (\Throwable) {
            $result = ['published' => false, 'error' => 'The GitHub branch outcome was not confirmed. Inspect the repository before retrying.'];
        }
        $this->finish($grant, $id, $result);
    }

    public function finish(object $grant, string $id, array $result): void
    {
        $tool = DB::table('vibes_tools')->where('id', $id)->where('agent_workspace_id', $grant->id)->firstOrFail();
        $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $grant->user_id)->firstOrFail();
        $state = isset($result['error']) ? 'unknown' : 'completed';
        $summary = $state === 'unknown' ? 'GitHub branch outcome unconfirmed.'
            : (!empty($result['published']) ? 'GitHub Agent branch published.' : 'GitHub branch publication refused.');
        DB::table('vibes_tools')->where('id', $id)->whereNull('result')
            ->whereIn('action_state', ['publishing', 'writing', 'unknown'])->update([
            'action_state' => $state, 'summary' => $summary, 'updated_at' => now()]);
        if ($state === 'unknown') {
            DB::table('vibes_tools')->where('id', $id)->whereNull('result')->update([
                'result' => json_encode($result), 'decision' => 'allow', 'updated_at' => now()]);
            if (!$turn->settled_at) app(Turns::class)->settle($turn->id, $turn->actual_micro_usd,
                null, 'The approved GitHub branch outcome is unconfirmed. Inspect the repository before trying again.');
            return;
        }
        try { app(AgentTools::class)->respond($grant->user_id, $id, 'allow', $result); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if ($e->getStatusCode() !== 409) throw $e;
            DB::table('vibes_tools')->where('id', $id)->whereNull('result')->update([
                'result' => json_encode($result), 'decision' => 'allow', 'updated_at' => now()]);
        }
    }
}
