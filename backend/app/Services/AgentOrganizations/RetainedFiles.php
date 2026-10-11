<?php
namespace App\Services\AgentOrganizations;
use App\Models\AgentV2\Run;
use Illuminate\Support\Facades\{DB, Storage};
final class RetainedFiles
{
    /** A file also referenced by personal history keeps that history's retention boundary. */
    public static function clear(Run $run): void
    {
        $ids = array_filter(array_column($run->attachments ?? [], 'id'), 'is_string');
        foreach (DB::table('agent_tool_actions')->where('run_id', $run->id)->where('tool', 'gmail_send')->pluck('arguments') as $args) {
            foreach ((json_decode($args, true)['attachments'] ?? []) as $attachment)
                if (is_string($attachment['id'] ?? null)) $ids[] = $attachment['id'];
        }
        $ids = array_unique($ids);
        foreach ($ids as $id) {
            $other = DB::table('agent_runs')->where('user_id', $run->user_id)->where('id', '!=', $run->id)
                ->where(fn ($q) => $q->where('attachments', 'like', '%'.$id.'%')->orWhereIn('id',
                    DB::table('agent_tool_actions')->where('user_id', $run->user_id)->where('arguments', 'like', '%'.$id.'%')->select('run_id')))->exists();
            if ($other) continue;
            $file = DB::table('agent_v2_attachments')->where('user_id', $run->user_id)->where('id', $id)->first();
            if (!$file) continue;
            DB::table('agent_v2_attachments')->where('id', $id)->delete();
            DB::afterCommit(fn () => Storage::disk(\App\Services\AgentRuns\Retention::disk())->delete($file->path));
        }
    }
}
