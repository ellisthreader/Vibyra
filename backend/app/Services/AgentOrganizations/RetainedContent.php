<?php
namespace App\Services\AgentOrganizations;
use App\Models\AgentV2\{Job, Run, WorkProposal};
use Illuminate\Support\Facades\DB;
final class RetainedContent
{
    public static function clear(Run $run): void
    {
        DB::table('agent_memories')->where('source_run_id', $run->id)->delete();
        foreach (WorkProposal::where('run_id', $run->id)->get() as $proposal)
            $proposal->forceFill(['spec' => ['title' => 'Removed by organisation retention'], 'status' => 'discarded',
                'revision' => $proposal->revision + 1])->save();
        $ids = DB::table('agent_output_revisions')->where('run_id', $run->id)->pluck('output_id');
        foreach (DB::table('agent_outputs')->whereIn('id', $ids)->lockForUpdate()->get() as $output) {
            DB::table('agent_output_revisions')->where('run_id', $run->id)->where('output_id', $output->id)->delete();
            // A later task may have independently revised this document; its retained content survives.
            if (DB::table('agent_output_revisions')->where('output_id', $output->id)->where('revision', $output->revision)->exists()) continue;
            $content = match ($output->kind) {'checklist' => ['items' => []], 'table' => ['columns' => ['Removed'], 'rows' => []],
                default => ['text' => 'Content removed by organisation retention.']};
            DB::table('agent_outputs')->where('id', $output->id)->update(['title' => 'Removed by organisation retention',
                'content' => json_encode($content), 'sources' => '[]', 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
        }
        // Independent jobs contain bounded copies of earlier history; clear only the expired source entry.
        foreach (Job::where('user_id', $run->user_id)->whereNotNull('context')->get() as $job) {
            $context = $job->context;
            if (!is_array($context['history'] ?? null)) continue;
            $history = array_values(array_filter($context['history'], fn ($h) => ($h['runId'] ?? null) !== $run->id));
            if (count($history) === count($context['history'])) continue;
            $job->forceFill(['context' => [...$context, 'history' => $history]])->save();
        }
    }
}
