<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\DB;

final class Actions
{
    public function create(object $w, string $id, string $operation, array $arguments, ?string $tool = null): object
    {
        $allowed = ['read_file', 'list_files', 'search_files', 'write_file', 'cloud_run_command', 'snapshot', 'preview'];
        abort_unless(in_array($operation, $allowed, true), 422, 'Unsupported cloud operation.');
        $digest = hash('sha256', json_encode([$w->id, $w->generation, $operation, $arguments, $tool], JSON_THROW_ON_ERROR));
        $old = DB::table('cloud_actions')->where('id', $id)->first();
        if ($old) { abort_unless(hash_equals($old->digest, $digest), 409, 'This command ID was already used.'); return $old; }
        abort_unless($w->state === 'ready' && $w->lease_until && now()->lt($w->lease_until), 409, 'Start this cloud computer before running a command.');
        abort_if(DB::table('cloud_actions')->where('workspace_id', $w->id)->whereIn('state', ['queued', 'running'])->count() >= 12, 429, 'Wait for the pending cloud actions.');
        if ($operation === 'write_file') {
            $p = $this->policy($w);
            abort_unless($p['canWrite'], 403, 'This session permits reads only.');
            abort_unless(is_string($arguments['path'] ?? null) && is_string($arguments['content'] ?? null)
                && strlen($arguments['content']) <= 8192 && is_string($arguments['expectedSha256'] ?? null), 422, 'Invalid file edit.');
        }
        if ($operation === 'cloud_run_command') {
            abort_unless(is_string($arguments['command'] ?? null) && in_array($arguments['command'], $this->policy($w)['commands'], true), 403, 'This exact command has not been approved for the session.');
        }
        if ($operation === 'preview') {
            abort_unless(config('cloud_workspaces.preview_enabled') && is_int($arguments['port'] ?? null)
                && $arguments['port'] >= 1024 && $arguments['port'] <= 65535
                && is_string($arguments['path'] ?? null) && str_starts_with($arguments['path'], '/')
                && !str_starts_with($arguments['path'], '//'), 422, 'Invalid or unavailable preview.');
        }
        DB::table('cloud_actions')->insert(['id' => $id, 'workspace_id' => $w->id, 'generation' => $w->generation,
            'operation' => $operation, 'digest' => $digest, 'arguments' => json_encode($arguments), 'tool_id' => $tool,
            'expires_at' => now()->addSeconds($operation === 'cloud_run_command' ? 180 : 120), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['last_activity_at' => now()]);
        return DB::table('cloud_actions')->where('id', $id)->first();
    }
    public function policy(object $w): array
    {
        return json_decode(DB::table('cloud_quotes')->where('id', $w->operation_id)->value('payload'), true, flags: JSON_THROW_ON_ERROR);
    }
    public function payload(object $a): array
    {
        return ['id' => $a->id, 'operation' => $a->operation, 'state' => $a->state,
            'result' => $a->result ? json_decode($a->result, true) : null, 'expiresAt' => $a->expires_at];
    }
}
