<?php
namespace App\Services\AgentBrowser;
use App\Models\AgentV2\{BrowserFile, Run};
use App\Services\AgentRuns\{Canonical, RunAttachments};
use App\Services\AgentRuns\Drafts\DraftAttachments;
use App\Services\AgentRuns\Tools\ToolRefused;
use Illuminate\Support\Facades\DB;
/** Only immutable files already selected for this exact task. No arbitrary IDs, URLs or paths. */
final class UploadSources
{
    public function metadata(Run $run, string $id): array
    {
        $admitted = collect($run->attachments ?? [])->firstWhere('id', $id);
        if ($admitted) {
            $row = DB::table('agent_v2_attachments')->where('user_id', $run->user_id)->where('id', $id)->first();
            $meta = $row ? DraftAttachments::metadata($row) : null;
            $pinned = array_intersect_key($admitted, array_flip(['id', 'name', 'mimeType', 'size', 'sha256']));
            if (!$meta || Canonical::hash($meta) !== Canonical::hash($pinned)) throw $this->refused();
        } else {
            $file = BrowserFile::query()->where('user_id', $run->user_id)->where('run_id', $run->id)->whereKey($id)->first();
            if (!$file) throw $this->refused();
            $meta = array_intersect_key(app(Files::class)->payload($file), array_flip(['id', 'name', 'mimeType', 'size', 'sha256']));
        }
        if (($meta['size'] ?? 0) <= 0 || $meta['size'] > FileContent::MAX || !in_array($meta['mimeType'], FileContent::MIMES, true))
            throw $this->refused();
        return $meta;
    }
    public function contents(Run $run, array $approved): string
    {
        $meta = $this->metadata($run, $approved['id'] ?? '');
        if (Canonical::hash($meta) !== Canonical::hash($approved)) throw $this->refused();
        try {
            if (in_array($meta['id'], array_column($run->attachments ?? [], 'id'), true))
                [, $bytes] = app(RunAttachments::class)->forRun($run, $meta['id']);
            else $bytes = base64_decode(BrowserFile::query()->where('user_id', $run->user_id)->where('run_id', $run->id)->findOrFail($meta['id'])->content, true);
        } catch (\Throwable) { throw $this->refused(); }
        if (!is_string($bytes) || strlen($bytes) !== $meta['size'] || !hash_equals($meta['sha256'], hash('sha256', $bytes)))
            throw $this->refused();
        return $bytes;
    }
    private function refused(): ToolRefused
    {
        return new ToolRefused('upload_file_unavailable', 'Choose a supported file attached to this task or downloaded during it. Changed files need fresh review.');
    }
}
