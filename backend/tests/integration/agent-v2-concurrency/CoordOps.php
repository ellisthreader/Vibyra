<?php
/** Independent processes exercise the real coordination transaction services. */
final class ConcCoordOps
{
    public static function run(array $a): array
    {
        config(['agents_v2.work_enabled' => true, 'agents_v2.coordination_enabled' => true]);
        $result = match ($a['mode']) {
            'plan' => app(\App\Services\AgentCoordination\Planning::class)->send($a['user'], $a['group'], $a['body']),
            'activate' => app(\App\Services\AgentCoordination\Workflows::class)->activate($a['user'], $a['spec'], $a['key']),
            'advance' => app(\App\Services\AgentCoordination\WorkflowProgress::class)->advance($a['id']),
            'control' => app(\App\Services\AgentCoordination\Workflows::class)->control($a['user'], $a['id'], $a['revision'], $a['action']),
            'group_save' => app(\App\Services\AgentCoordination\Groups::class)->save($a['user'], $a['id'], $a['body']),
            default => throw new InvalidArgumentException('Unknown coordination test operation.'),
        };
        return ['status' => 200, 'json' => $result ?? []];
    }
}
