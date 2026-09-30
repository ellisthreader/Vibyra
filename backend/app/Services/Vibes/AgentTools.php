<?php

namespace App\Services\Vibes;

use App\Jobs\RunVibesTurn;
use App\Services\ChatConnectors\ConnectorTools;
use App\Services\Agents\VmTestAction;
use App\Services\Agents\VmPlatform;
use App\Services\Agents\BranchPublication\BranchAction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AgentTools
{
    public static function readNames(): array
    {
        return ['list_files', 'read_file', 'search_files', 'git_status', 'git_diff'];
    }
    public static function readDefinitions(): array
    {
        return [...array_values(array_filter(self::definitions(), fn ($tool) => in_array($tool['function']['name'], self::readNames(), true))),
            ...ProjectToolDefinitions::git()];
    }

    public static function computerDefinitions(bool $canWrite, bool $canTest = false, bool $canPublish = false): array
    {
        $reads = self::readDefinitions();
        if (!$canWrite) return $reads;
        return [...$reads, ...array_values(array_filter(self::definitions(),
            fn ($tool) => $tool['function']['name'] === 'write_file')),
            ...($canTest ? [VmTestAction::definition()] : []),
            ...($canPublish ? BranchAction::definitions() : [])];
    }

    public static function definitions(): array
    {
        return ProjectToolDefinitions::basic();
    }

    public function awaitTools(object $turn, array $message, int $micro): void
    {
        DB::transaction(function () use ($turn, $message, $micro) {
            app(Wallet::class)->lock($turn->user_id);
            $current = DB::table('vibes_turns')->where('id', $turn->id)->firstOrFail();
            if ($current->settled_at) return;
            if ($current->cancel_requested) {
                app(Turns::class)->settle($turn->id, $current->actual_micro_usd + $micro, null, 'Stopped before project tools. Only confirmed AI usage was charged.');
                return;
            }
            $request = json_decode($current->request, true);
            abort_unless(!empty($request['tools']), 422, 'This conversation has no project tool access.');
            $calls = $message['tool_calls'] ?? [];
            abort_unless(is_array($calls), 422, 'Invalid tool requests.');
            // A bounded Gmail search can return ten messages, which the model may
            // read in one parallel batch. Keep the batch capped at that same bound.
            abort_if(count($calls) > 10 || count($calls) === 0, 422, 'Too many tool requests.');
            // The allowlist is the set this turn actually offered, so a tool cannot be
            // accepted here unless the priced request already contained its schema.
            $offered = array_column(array_column($request['tools'], 'function'), 'name');
            $ids = array_column($calls, 'id');
            abort_unless(count(array_filter($ids, 'is_string')) === count($ids), 422, 'Invalid tool identifiers.');
            abort_unless(count($ids) === count($calls) && count(array_unique($ids)) === count($ids), 422, 'Invalid tool identifiers.');
            $request['messages'][] = $message;
            foreach ($calls as $call) {
                abort_unless(is_string($call['id']) && strlen($call['id']) <= 200
                    && !DB::table('vibes_tools')->where('turn_id', $turn->id)->where('provider_id', $call['id'])->exists(), 422, 'Invalid tool identifier.');
                $name = $call['function']['name'] ?? '';
                abort_unless(in_array($name, $offered, true), 422, 'Unsupported AI tool.');
                abort_unless(is_string($call['function']['arguments'] ?? null), 422, 'Invalid tool arguments.');
                $args = json_decode($call['function']['arguments'], true, flags: JSON_THROW_ON_ERROR);
                abort_unless(is_array($args), 422, 'Invalid tool arguments.');
                // An integration call is answered by this server against the person's own
                // connected account; a project call is answered by their phone.
                $integration = app(ConnectorTools::class)->ownerOf($name);
                $workspace = $request['vibyraAgent']['workspaceId'] ?? null;
                if ($workspace !== null && $integration === null) {
                    $canWrite = DB::table('agent_workspaces')->where('id', $workspace)
                        ->where('user_id', $turn->user_id)->where('agent_id', $request['vibyraAgent']['id'] ?? '')
                        ->whereNull('revoked_at')->value('can_write');
                    $canTest = $name === 'run_test' && VmPlatform::allows(
                        DB::table('agent_workspaces')->where('id', $workspace)
                            ->where('user_id', $turn->user_id)->whereNull('revoked_at')->first());
                    $publish = in_array($name, [BranchAction::PREVIEW, BranchAction::PUBLISH], true)
                        && $canWrite && config('agents.git_publish_enabled')
                        && in_array('github', $request['vibyraAgent']['integrations'] ?? [], true)
                        && in_array('github', app(ConnectorTools::class)->resolve($turn->user_id, ['github']), true);
                    abort_unless(in_array($name, self::readNames(), true)
                        || ($name === 'write_file' && $canWrite) || $canTest || $publish, 422,
                        'This computer grant does not allow that project action.');
                }
                $safe = $integration !== null ? app(ConnectorTools::class)->validate($integration, $name, $args)
                    : (in_array($name, [BranchAction::PREVIEW, BranchAction::PUBLISH], true)
                        ? ($name === BranchAction::PUBLISH
                            ? BranchAction::proposal($args, (string) $workspace, $turn->id)
                            : BranchAction::arguments($name, $args, (string) $workspace))
                        : $this->fileArguments($name, $args));
                DB::table('vibes_tools')->insert(['id' => (string) Str::uuid(), 'turn_id' => $turn->id,
                    'provider_id' => $call['id'], 'operation' => $name, 'integration' => $integration,
                    'agent_workspace_id' => $integration === null ? $workspace : null, 'arguments' => json_encode($safe),
                    'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('vibes_turns')->where('id', $turn->id)->update(['status' => 'waiting',
                'request' => json_encode($request), 'actual_micro_usd' => $current->actual_micro_usd + $micro,
                'generation_id' => null, 'updated_at' => now()]);
        });
    }

    private function fileArguments(string $name, array $args): array
    {
        if ($name === 'cloud_run_command') {
            abort_unless(count($args) === 1 && is_string($args['command'] ?? null) && strlen($args['command']) <= 500, 422, 'Invalid cloud command.');
            return ['command' => $args['command']];
        }
        if ($name === 'run_test') return VmTestAction::arguments($args);
        abort_unless(in_array($name, ['list_files', 'read_file', 'write_file', 'search_files', 'git_status', 'git_diff'], true), 422, 'Unsupported AI tool.');
        if ($name === 'git_status') {
            abort_unless($args === [], 422, 'Git status takes no arguments.');
            return [];
        }
        if ($name === 'search_files') {
            abort_unless(is_string($args['query'] ?? null) && trim($args['query']) !== '' && strlen($args['query']) <= 200,
                422, 'Say what to search the project for, in 200 characters or fewer.');
            return array_intersect_key($args, array_flip(['query']));
        }
        abort_unless(is_string($args['path'] ?? null) && strlen($args['path']) <= 2048, 422, 'Invalid tool path.');
        if ($name === 'write_file') abort_unless(is_string($args['content'] ?? null) && strlen($args['content']) <= 8192
            && is_string($args['expectedSha256'] ?? null), 422, 'Invalid file edit.');
        return array_intersect_key($args, array_flip(['path', 'content', 'expectedSha256']));
    }
    public function respond(int $userId, string $id, string $decision, array $result, ?string $cloudAction = null): void
    {
        $turnId = DB::transaction(function () use ($userId, $id, $decision, $result, $cloudAction) {
            app(Wallet::class)->lock($userId);
            $tool = DB::table('vibes_tools')->where('id', $id)->firstOrFail();
            $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $userId)->firstOrFail();
            $chat = DB::table('vibes_chats')->where('id', $turn->chat_id)->firstOrFail();
            if ($chat->cloud_workspace_id ?? null) {
                abort_unless($cloudAction && DB::table('cloud_actions')->where('id', $cloudAction)->where('tool_id', $id)
                    ->where('workspace_id', $chat->cloud_workspace_id)->where('state', 'completed')->exists(), 403, 'Only the authorized cloud runtime can answer this tool.');
            }
            $encoded = json_encode($result, JSON_THROW_ON_ERROR);
            if ($tool->result !== null) {
                abort_unless($tool->decision === $decision && $tool->result === $encoded, 409, 'This tool already has a different response.');
                return null;
            }
            abort_unless($turn->status === 'waiting' && !$turn->settled_at && !$turn->cancel_requested, 409, 'This tool request is no longer active.');
            abort_if(now()->greaterThanOrEqualTo(self::expires($tool)), 409, 'This tool request expired.');
            DB::table('vibes_tools')->where('id', $id)->update(['decision' => $decision, 'result' => $encoded, 'updated_at' => now()]);
            $all = DB::table('vibes_tools')->where('turn_id', $turn->id)->get();
            if ($all->contains(fn ($t) => $t->result === null)) return null;
            $request = json_decode($turn->request, true);
            $answered = array_column(array_filter($request['messages'], fn ($m) => $m['role'] === 'tool'), 'tool_call_id');
            foreach ($all as $t) {
                if (!in_array($t->provider_id, $answered)) $request['messages'][] = [
                    'role' => 'tool', 'tool_call_id' => $t->provider_id, 'content' => $t->result,
                ];
            }
            DB::table('vibes_turns')->where('id', $turn->id)->update(['request' => json_encode($request),
                'status' => 'queued', 'updated_at' => now()]);
            app(\App\Services\Progress\WorkEvents::class)->observe($turn->id);
            return $turn->id;
        });
        if ($turnId) RunVibesTurn::dispatch($turnId);
    }

    public function payload(string $turnId): array
    {
        // An integration's result is the person's own mail or payments and is answered
        // here, so the phone is sent the one line it renders and nothing more.
        return DB::table('vibes_tools')->where('turn_id', $turnId)->orderBy('created_at')->get()->map(fn ($t) => $t->integration ? [
            'id' => $t->id, 'operation' => $t->operation, 'integration' => $t->integration, 'summary' => $t->summary,
            'decision' => $t->decision, 'expiresAt' => self::expires($t)->timestamp,
            'approval' => $t->action_state ? ['state' => $t->action_state, 'fingerprint' => $t->action_hash,
                'arguments' => json_decode($t->arguments, true), 'answer' => $t->action_answer] : null,
        ] : [
            'id' => $t->id, 'operation' => $t->operation, 'arguments' => json_decode($t->arguments, true),
            'decision' => $t->decision, 'result' => $t->result ? json_decode($t->result, true) : null,
            'approval' => $t->action_state ? ['state' => $t->action_state, 'fingerprint' => $t->action_hash,
                'arguments' => json_decode($t->arguments, true), 'answer' => $t->action_answer] : null,
            'expiresAt' => self::expires($t)->timestamp,
        ])->all();
    }

    public static function expires(object $tool): \Illuminate\Support\Carbon
    {
        $seconds = $tool->agent_workspace_id && in_array($tool->operation,
            [...self::readNames(), BranchAction::PREVIEW], true)
            ? \App\Services\Agents\Workspaces::WAIT_SECONDS : 900;
        return \Illuminate\Support\Carbon::parse($tool->created_at)->addSeconds($seconds);
    }
}
