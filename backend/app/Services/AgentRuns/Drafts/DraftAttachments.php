<?php

namespace App\Services\AgentRuns\Drafts;

use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\DB;

/** Only this person's already validated uploads can become a draft attachment. No URL/path/bytes input. */
final class DraftAttachments
{
    public const MAX_FILES = 4;
    public const MAX_BYTES = 2 * 1024 * 1024;

    public function resolve(int $user, array $ids): array
    {
        abort_if(count($ids) > self::MAX_FILES || count(array_unique($ids)) !== count($ids), 422, 'Attach up to four different files.');
        $rows = DB::table('agent_v2_attachments')->where('user_id', $user)->whereIn('id', $ids)->get()->keyBy('id');
        return array_map(function ($id) use ($rows) {
            $row = $rows->get($id);
            if (!$row || $row->bytes < 0 || $row->bytes > self::MAX_BYTES
                || !in_array($row->mime, ['image/jpeg', 'application/pdf', 'text/plain'], true))
                ApiError::throw(422, 'attachment_not_found', 'An attachment is unavailable or unsupported. Upload it again.');
            return self::metadata($row);
        }, $ids);
    }

    public static function metadata(object $row): array
    {
        return ['id' => $row->id, 'name' => $row->name, 'mimeType' => $row->mime,
            'size' => (int) $row->bytes, 'sha256' => $row->sha256];
    }
}
