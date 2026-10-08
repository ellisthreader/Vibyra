<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Models\AgentV2\{Connection, ToolAction};
use App\Services\AgentRuns\{Canonical, Retention};
use App\Services\AgentRuns\Drafts\DraftAttachments;
use Illuminate\Support\Facades\{DB, Storage};

/** Resolves only the exact approved action's owned manifest, and verifies bytes before Gmail receives anything. */
final class GmailAttachmentBytes
{
    public function forAction(string $key, array $arguments): array
    {
        $action = ToolAction::query()->whereKey($key)->where('tool', 'gmail_send')->first();
        $manifest = $arguments['attachments'] ?? [];
        if (!is_array($manifest)) throw $this->refused();
        if (!$action) {
            if ($manifest) throw $this->refused();
            return ['from' => null, 'files' => []]; // Plain MIME adapter tests and legacy callers do not need a stored action.
        }
        if (Canonical::hash($arguments) !== Canonical::hash($action->arguments ?? [])
            || $action->state !== 'dispatching' || !$action->dispatched_at || count($manifest) > DraftAttachments::MAX_FILES)
            throw $this->refused();
        $connection = Connection::query()->whereKey($action->connection_id)->where('user_id', $action->user_id)->first();
        if (!$connection || $connection->provider !== 'gmail' || $connection->revoked_at || $connection->health !== 'healthy'
            || $connection->generation !== $action->connection_generation
            || ($manifest && !filter_var($connection->external_identity, FILTER_VALIDATE_EMAIL))) throw $this->refused();
        $files = [];
        foreach ($manifest as $approved) {
            $row = is_array($approved) ? DB::table('agent_v2_attachments')->where('user_id', $action->user_id)->where('id', $approved['id'] ?? '')->first() : null;
            if (!$row || $row->bytes < 0 || $row->bytes > DraftAttachments::MAX_BYTES
                || !in_array($row->mime, ['image/jpeg', 'application/pdf', 'text/plain'], true) || !hash_equals(Canonical::hash($approved), Canonical::hash(DraftAttachments::metadata($row))))
                throw $this->refused();
            try { $bytes = Storage::disk(Retention::disk())->get($row->path); }
            catch (\Throwable) { throw $this->refused(); }
            if (!is_string($bytes) || strlen($bytes) !== (int) $row->bytes || !hash_equals($row->sha256, hash('sha256', $bytes)))
                throw $this->refused();
            $files[] = [...$approved, 'bytes' => $bytes];
        }
        return ['from' => filter_var($connection->external_identity, FILTER_VALIDATE_EMAIL) ? $connection->external_identity : null, 'files' => $files];
    }

    private function refused(): ToolFailure
    {
        return ToolFailure::refused('attachment_changed', 'The approved sender or attachment is unavailable or changed. Prepare and review the draft again.');
    }
}
