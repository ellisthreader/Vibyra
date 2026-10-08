<?php

namespace App\Services\AgentRuns\CloudFiles;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Tools\Providers\Schema;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/** Private logical files, never OS paths. Scope lock serialises quota and CAS across runs. */
final class Files
{
    public const FILE_BYTES = 65536;
    public const TOTAL_BYTES = 8388608;
    public const MAX_FILES = 100;

    public function read(Run $run, array $args): array
    {
        Schema::only($args, ['path', 'revision']);
        $scope = FileScope::attributes($run);
        if (!array_key_exists('path', $args)) {
            abort_if(isset($args['revision']), 422, 'Choose a file before its revision.');
            return ['files' => DB::table('agent_cloud_files')->where('scope_id', $scope['id'])->orderBy('path')
                ->limit(self::MAX_FILES)->get(['path', 'revision', 'updated_at'])->map(fn ($f) =>
                    ['path' => $f->path, 'revision' => (int) $f->revision, 'updatedAt' => $f->updated_at])->all()];
        }
        $file = $this->file($scope['id'], FileScope::path($args['path']));
        if (!$file) ApiError::throw(404, 'cloud_file_not_found', 'That private file does not exist.');
        $revision = $args['revision'] ?? (int) $file->revision;
        abort_unless(is_int($revision) && $revision >= 1, 422, 'Use a positive file revision.');
        $v = DB::table('agent_cloud_file_versions')->where('file_id', $file->id)->where('revision', $revision)->first();
        if (!$v) ApiError::throw(404, 'cloud_file_not_found', 'That file revision does not exist.');
        $content = Crypt::decryptString($v->content);
        abort_unless(hash_equals($v->sha256, hash('sha256', $content)) && strlen($content) === (int) $v->bytes, 503, 'File integrity check failed.');
        return ['file' => ['path' => $file->path, 'revision' => $revision, 'currentRevision' => (int) $file->revision,
            'content' => $content, 'bytes' => (int) $v->bytes, 'sha256' => $v->sha256, 'sourceRunId' => $v->run_id]];
    }

    /** Enclosed by the fenced broker transaction, so content and call-ID receipt commit atomically. */
    public function write(Run $run, array $args): array
    {
        Schema::only($args, ['path', 'content', 'revision']);
        $path = FileScope::path($args['path'] ?? null);
        $content = $args['content'] ?? null;
        abort_unless(is_string($content) && mb_check_encoding($content, 'UTF-8') && !str_contains($content, "\0")
            && strlen($content) <= self::FILE_BYTES, 422, 'Use UTF-8 text up to 64 KiB.');
        abort_unless(is_int($args['revision'] ?? null) && $args['revision'] >= 0, 422, 'Use revision 0 to create, or the current revision to update.');
        $scope = FileScope::attributes($run);
        DB::table('agent_cloud_file_scopes')->insertOrIgnore($scope);
        $quota = DB::table('agent_cloud_file_scopes')->where('id', $scope['id'])->lockForUpdate()->firstOrFail();
        $file = $this->file($scope['id'], $path);
        if ($args['revision'] !== ($file ? (int) $file->revision : 0))
            ApiError::throw(409, 'cloud_file_changed', 'This file changed. Read its current revision before saving.');
        abort_if(!$file && $quota->file_count >= self::MAX_FILES, 422, 'This private workspace has reached 100 files.');
        abort_if($quota->stored_bytes + strlen($content) > self::TOTAL_BYTES || ($file && $file->revision >= 100),
            422, 'This private workspace has reached its saved-version limit.');
        $id = $file?->id ?? (string) Str::uuid();
        $revision = $args['revision'] + 1;
        if (!$file) DB::table('agent_cloud_files')->insert(['id' => $id, 'scope_id' => $scope['id'], 'path' => $path,
            'revision' => $revision, 'created_at' => now(), 'updated_at' => now()]);
        else DB::table('agent_cloud_files')->where('id', $id)->update(['revision' => $revision, 'updated_at' => now()]);
        $hash = hash('sha256', $content);
        DB::table('agent_cloud_file_versions')->insert(['file_id' => $id, 'run_id' => $run->id, 'revision' => $revision,
            'bytes' => strlen($content), 'sha256' => $hash, 'content' => Crypt::encryptString($content), 'created_at' => now()]);
        DB::table('agent_cloud_file_scopes')->where('id', $scope['id'])->update([
            'file_count' => $quota->file_count + ($file ? 0 : 1), 'stored_bytes' => $quota->stored_bytes + strlen($content)]);
        return ['file' => ['path' => $path, 'revision' => $revision, 'bytes' => strlen($content), 'sha256' => $hash,
            'sourceRunId' => $run->id, 'saved' => true]];
    }

    private function file(string $scope, string $path): ?object
    {
        return DB::table('agent_cloud_files')->where('scope_id', $scope)->where('path', $path)->first();
    }
}
