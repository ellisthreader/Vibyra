<?php

namespace App\Services\AgentRuns\CloudFiles;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{ApiError, Canonical};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class FileScope
{
    public static function available(Run $run): bool
    {
        $s = $run->runtime_snapshot ?? [];
        return config('agents_v2.cloud_enabled') && ($s['executionTarget'] ?? '') === 'cloud'
            && is_string($s['cloudWorkspaceId'] ?? null) && Str::isUuid($s['cloudWorkspaceId'])
            && is_string($s['provider'] ?? null) && trim($s['provider']) !== ''
            && is_string($s['accountRef'] ?? null) && trim($s['accountRef']) !== '';
    }

    public static function attributes(Run $run): array
    {
        if (!self::available($run)) ApiError::throw(403, 'cloud_files_unavailable', 'Private files require an authorised cloud task.');
        $s = $run->runtime_snapshot;
        abort_unless(DB::table('cloud_workspaces')->where('id', $s['cloudWorkspaceId'])
            ->where('user_id', $run->user_id)->where('state', '!=', 'deleted')->exists(), 404, 'Cloud workspace not found.');
        abort_unless(DB::table('agent_teammates')->where('id', $run->agent_id)->where('user_id', $run->user_id)->exists(), 404);
        $account = Canonical::hash([$s['provider'], $s['accountRef']]);
        return ['id' => Canonical::hash([$run->user_id, $run->agent_id, $s['cloudWorkspaceId'], $account]),
            'user_id' => $run->user_id, 'agent_id' => $run->agent_id, 'workspace_id' => $s['cloudWorkspaceId'], 'account_scope' => $account];
    }

    public static function path(mixed $path): string
    {
        abort_unless(is_string($path) && strlen($path) <= 180
            && preg_match('~\A[a-zA-Z0-9][a-zA-Z0-9 _./-]*\z~D', $path), 422, 'Use a relative text-file path.');
        foreach (explode('/', $path) as $part) {
            abort_if($part === '' || trim($part) !== $part || str_starts_with($part, '.') || str_ends_with($part, '.'),
                422, 'Hidden, empty or relative path segments are not allowed.');
        }
        abort_unless(preg_match('/\.(?:txt|md|csv|json|yaml|yml|log)$/iD', $path), 422, 'Save a text, Markdown, CSV, JSON, YAML or log file.');
        return $path;
    }
}
