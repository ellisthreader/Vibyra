<?php

namespace App\Services\Vibes;

use App\Jobs\RunVibesTurn;
use App\Services\Integrations\IntegrationTools;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AgentTools
{
    public static function definitions(): array
    {
        $string = ['type' => 'string'];
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], [
            ['name' => 'list_files', 'description' => 'List files in the authorized project, excluding secrets and dependencies.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string], 'required' => ['path'], 'additionalProperties' => false]],
            ['name' => 'read_file', 'description' => 'Read a UTF-8 project file. Returns content and sha256. Do not edit truncated files.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string], 'required' => ['path'], 'additionalProperties' => false]],
            ['name' => 'write_file', 'description' => 'Write a project file, at most 8 KB. Requires explicit user approval. Use sha256 from read_file, or new for a new file.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string, 'content' => $string, 'expectedSha256' => $string],
                    'required' => ['path', 'content', 'expectedSha256'], 'additionalProperties' => false]],
        ]);
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
            abort_if(count($calls) > 4 || count($calls) === 0, 422, 'Too many tool requests.');
            // The allowlist is the set this turn actually offered, so a tool cannot be
            // accepted here unless the priced request already contained its schema.
            $offered = array_column(array_column($request['tools'], 'function'), 'name');
            $ids = array_column($calls, 'id');
            abort_unless(count($ids) === count($calls) && count(array_unique($ids)) === count($ids), 422, 'Invalid tool identifiers.');
            $request['messages'][] = $message;
            foreach ($calls as $call) {
                abort_unless(is_string($call['id']) && strlen($call['id']) <= 200
                    && !DB::table('vibes_tools')->where('turn_id', $turn->id)->where('provider_id', $call['id'])->exists(), 422, 'Invalid tool identifier.');
                $name = $call['function']['name'] ?? '';
                abort_unless(in_array($name, $offered, true), 422, 'Unsupported AI tool.');
                $args = json_decode($call['function']['arguments'], true, flags: JSON_THROW_ON_ERROR);
                abort_unless(is_array($args), 422, 'Invalid tool arguments.');
                // An integration call is answered by this server against the person's own
                // connected account; a project call is answered by their phone.
                $integration = app(IntegrationTools::class)->ownerOf($name);
                $safe = $integration !== null ? app(IntegrationTools::class)->validate($integration, $name, $args) : $this->fileArguments($name, $args);
                DB::table('vibes_tools')->insert(['id' => (string) Str::uuid(), 'turn_id' => $turn->id,
                    'provider_id' => $call['id'], 'operation' => $name, 'integration' => $integration, 'arguments' => json_encode($safe),
                    'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('vibes_turns')->where('id', $turn->id)->update(['status' => 'waiting',
                'request' => json_encode($request), 'actual_micro_usd' => $current->actual_micro_usd + $micro,
                'generation_id' => null, 'updated_at' => now()]);
        });
    }

    /** The project tools' own argument check, unchanged and still the only file path gate. */
    private function fileArguments(string $name, array $args): array
    {
        abort_unless(in_array($name, ['list_files', 'read_file', 'write_file'], true), 422, 'Unsupported AI tool.');
        abort_unless(is_string($args['path'] ?? null) && strlen($args['path']) <= 2048, 422, 'Invalid tool path.');
        if ($name === 'write_file') abort_unless(is_string($args['content'] ?? null) && strlen($args['content']) <= 8192
            && is_string($args['expectedSha256'] ?? null), 422, 'Invalid file edit.');
        return array_intersect_key($args, array_flip(['path', 'content', 'expectedSha256']));
    }

    public function respond(int $userId, string $id, string $decision, array $result): void
    {
        $turnId = DB::transaction(function () use ($userId, $id, $decision, $result) {
            app(Wallet::class)->lock($userId);
            $tool = DB::table('vibes_tools')->where('id', $id)->firstOrFail();
            $turn = DB::table('vibes_turns')->where('id', $tool->turn_id)->where('user_id', $userId)->firstOrFail();
            $encoded = json_encode($result, JSON_THROW_ON_ERROR);
            if ($tool->result !== null) {
                abort_unless($tool->decision === $decision && $tool->result === $encoded, 409, 'This tool already has a different response.');
                return null;
            }
            abort_unless($turn->status === 'waiting' && !$turn->settled_at && !$turn->cancel_requested, 409, 'This tool request is no longer active.');
            abort_if(now()->greaterThanOrEqualTo(\Illuminate\Support\Carbon::parse($tool->created_at)->addMinutes(15)), 409, 'This tool request expired.');
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
            'decision' => $t->decision, 'expiresAt' => \Illuminate\Support\Carbon::parse($t->created_at)->addMinutes(15)->timestamp,
        ] : [
            'id' => $t->id, 'operation' => $t->operation, 'arguments' => json_decode($t->arguments, true),
            'decision' => $t->decision, 'result' => $t->result ? json_decode($t->result, true) : null,
            'expiresAt' => \Illuminate\Support\Carbon::parse($t->created_at)->addMinutes(15)->timestamp,
        ])->all();
    }
}
