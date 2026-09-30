<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use App\Services\Vibes\Attachments;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;

/**
 * Photos, PDFs and text files for Agent V2 runs. Uploaded first (validated and
 * normalized exactly like phone chat attachments), stored privately, then named
 * by id in run admission. Bytes never ride in a run payload: only the leased
 * runner of a run that names an attachment can fetch it. No Vibes are involved.
 */
final class RunAttachments
{
    /** Per account per day: plenty for a person, and a bound on what storage holds. */
    public const DAILY = 100;
    private const FIELDS = ['name', 'mimeType', 'size', 'sha256', 'ref'];

    public function __construct(private readonly Attachments $validator) {}

    public function store(int $userId, UploadedFile $file): array
    {
        if (DB::table('agent_v2_attachments')->where('user_id', $userId)->where('created_at', '>', now()->subDay())->count() >= self::DAILY)
            ApiError::throw(429, 'attachment_limit', 'That is a lot of attachments for one day. Try again tomorrow.');
        [$kind, $name, $contents, $mime] = $this->validator->prepare($file);
        $id = (string) Str::uuid();
        $path = 'agent-v2-attachments/'.$userId.'/'.$id;
        if (!Storage::disk($this->disk())->put($path, $contents))
            ApiError::throw(503, 'attachment_unsaved', 'The attachment could not be saved. Try again.');
        DB::table('agent_v2_attachments')->insert(['id' => $id, 'user_id' => $userId, 'kind' => $kind, 'mime' => $mime,
            'name' => $name, 'bytes' => strlen($contents), 'sha256' => hash('sha256', $contents), 'path' => $path,
            'created_at' => now(), 'updated_at' => now()]);
        return $this->payload(DB::table('agent_v2_attachments')->where('id', $id)->first());
    }

    public function payload(object $a): array
    {
        return ['id' => $a->id, 'kind' => $a->kind, 'name' => $a->name, 'mimeType' => $a->mime,
            'size' => (int) $a->bytes, 'sha256' => $a->sha256];
    }

    /**
     * Admission attachments: an `{id}` entry becomes the stored file's exact metadata
     * (this account's own upload, else 422 `attachment_not_found`); metadata-only
     * entries (older clients) pass through unchanged.
     */
    public function resolve(int $userId, array $items): array
    {
        $ids = array_values(array_filter(array_column($items, 'id'), 'is_string'));
        $rows = $ids ? DB::table('agent_v2_attachments')->where('user_id', $userId)->whereIn('id', $ids)->get()->keyBy('id') : collect();
        return array_map(function (array $item) use ($rows) {
            if (!isset($item['id'])) return array_intersect_key($item, array_flip(self::FIELDS));
            $row = $rows->get($item['id']);
            if (!$row) ApiError::throw(422, 'attachment_not_found', 'An attachment is no longer available. Attach it again.');
            return $this->payload($row);
        }, array_values($items));
    }

    /** @return array{0: object, 1: string} the stored row and its bytes, only for an attachment this run names */
    public function forRun(Run $run, string $attachmentId): array
    {
        $named = in_array($attachmentId, array_column($run->attachments ?? [], 'id'), true);
        $row = $named ? DB::table('agent_v2_attachments')->where('user_id', $run->user_id)->where('id', $attachmentId)->first() : null;
        if (!$row) ApiError::throw(404, 'attachment_not_found', 'That attachment is not part of this task.');
        $bytes = Storage::disk($this->disk())->get($row->path);
        if (!is_string($bytes)) ApiError::throw(404, 'attachment_not_found', 'That attachment is no longer stored.');
        return [$row, $bytes];
    }

    private function disk(): string
    {
        return Retention::disk();
    }
}
