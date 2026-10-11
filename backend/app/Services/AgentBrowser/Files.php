<?php
namespace App\Services\AgentBrowser;
use App\Models\AgentV2\{BrowserFile, Connection, Run, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\{ApiError, Leases};
use App\Services\AgentRuns\Browser\BrowserOrigins;
use App\Services\AgentRuns\Jobs\AccountLock;
use Illuminate\Support\Facades\DB;
final class Files
{
    public const QUOTA = 100 * 1024 * 1024;
    public function store(RuntimeBinding $binding, string $runId, int $generation, array $args): BrowserFile
    {
        [$name, $mime, $bytes, $sha] = FileContent::validate($args);
        return DB::transaction(function () use ($binding, $runId, $generation, $args, $name, $mime, $bytes, $sha) {
            AccountLock::force($binding->user_id);
            $run = app(Leases::class)->fenced($binding, $runId, $generation, true, true);
            $action = ToolAction::query()->where('run_id', $run->id)->where('user_id', $run->user_id)
                ->whereKey($args['actionId'] ?? '')->lockForUpdate()->first();
            abort_unless($action && $action->tool === 'browser_download' && $action->kind === 'read'
                && in_array($action->state, ['dispatching', 'completed'], true)
                && (int) $action->claimed_generation === $generation && $action->dispatched_at
                && ($binding->capabilities['browserWorkflowsV1'] ?? false) === true
                && Connection::query()->whereKey($action->connection_id)->where('provider', 'browser')->exists(), 409, 'Claim this browser download before saving its file.');
            $existing = BrowserFile::query()->where('action_id', $action->id)->first();
            if ($existing) {
                if (!hash_equals($existing->sha256, $sha) || $existing->name !== $name || $existing->mime !== $mime)
                    ApiError::throw(409, 'browser_file_conflict', 'This download already has a different file.');
                return $existing;
            }
            $origin = BrowserOrigins::ofUrl($action->arguments['url'] ?? null);
            abort_unless(is_string($origin), 422, 'The claimed download has no source site.');
            abort_unless(BrowserFile::query()->where('user_id', $run->user_id)->sum('size') + strlen($bytes) <= self::QUOTA,
                422, 'Saved browser files have reached the 100 MB account limit.');
            return BrowserFile::query()->create(['user_id' => $run->user_id, 'agent_id' => $run->agent_id,
                'run_id' => $run->id, 'action_id' => $action->id, 'name' => $name, 'mime' => $mime,
                'size' => strlen($bytes), 'sha256' => $sha, 'source_origin' => $origin, 'content' => base64_encode($bytes)]);
        });
    }
    public function find(int $userId, string $id): BrowserFile
    {
        $file = BrowserFile::query()->whereKey($id)->where('user_id', $userId)->first();
        if (!$file) ApiError::throw(404, 'browser_file_not_found', 'That browser file does not exist.');
        return $file;
    }
    public function list(int $userId, string $agentId): array
    {
        abort_unless(DB::table('agent_teammates')->where('id', $agentId)->where('user_id', $userId)->exists(), 404);
        return BrowserFile::query()->where('user_id', $userId)->where('agent_id', $agentId)
            ->latest()->limit(100)->get()->map(fn ($file) => $this->payload($file))->all();
    }
    public function payload(BrowserFile $file): array
    {
        return ['id' => $file->id, 'name' => $file->name, 'mimeType' => $file->mime, 'size' => $file->size,
            'sha256' => $file->sha256, 'sourceOrigin' => $file->source_origin, 'runId' => $file->run_id,
            'agentId' => $file->agent_id, 'createdAt' => $file->created_at?->toIso8601String()];
    }
    /** A model receipt can name only the exact artifact saved for this action. */
    public function receipt(ToolAction $action, array $result): array
    {
        $file = BrowserFile::query()->where('action_id', $action->id)->where('user_id', $action->user_id)->first();
        abort_unless($file && ($result['file']['id'] ?? null) === $file->id
            && ($result['file']['sha256'] ?? null) === $file->sha256, 422, 'This receipt must name the saved download.');
        return ['url' => $file->source_origin, 'file' => $this->payload($file)];
    }
}
