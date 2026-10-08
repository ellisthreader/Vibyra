<?php

/** Test-only entrypoints executed by independent PHP processes in the guarded PG harness. */
final class ConcAgentWorkOps
{
    public static function run(array $a): array
    {
        config(['agents_v2.work_enabled' => true]);
        $result = match ($a['mode']) {
            'goal_advance' => app(\App\Services\AgentWork\GoalProgress::class)->advance($a['id']),
            'follow_advance' => app(\App\Services\AgentWork\FollowUpProgress::class)->advance($a['id']),
            'source_event' => app(\App\Services\AgentTriggers\TriggerIntake::class)->receive(\App\Models\AgentV2\Trigger::findOrFail($a['id']), $a['key'], 'github.issue', ['title' => 'Verified test event'], $a['subject']),
            'routine_activate' => app(\App\Services\AgentWork\Routines::class)->activate($a['user'], $a['spec'], $a['key']),
            default => throw new InvalidArgumentException('Unknown work operation.'),
        };
        return ['status' => 200, 'json' => $result ?? []];
    }
}
